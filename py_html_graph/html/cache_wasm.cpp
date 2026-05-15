#include <cstdlib>
#include <cstring>
#include <cmath>
#include <cstdint>

#define MAX_LEVELS 64
#define MAX_PENDING 2048
#define IO_BUF_SIZE (4 * 1024 * 1024)
#define CACHE_FREE 0
#define CACHE_LOADED 1
#define CACHE_REQUESTING 2

static int G_total = 0;
static int G_vnum = 0;
static int G_max_lv = -1;
static int G_max_cache_lv = -1;
static int G_req_start = -1;
static int G_req_end = -1;
static int G_req_step = -1;
static int G_req_level = -1;
static int G_req_wmax = -1;
static int G_has_req = 0;
static double G_mouse = 0.5;
static int G_required_updown_level = -1; // 默认 4

struct Cache {
    uint8_t* status;
    uint8_t* data;
    int len;
};
static Cache G_cd[MAX_LEVELS];

struct Range {
    int start, end, valid;
};
static Range G_req_rng[MAX_LEVELS];
static Range G_unne_rng[MAX_LEVELS];
static uint8_t* G_whole[MAX_LEVELS];
static int G_whole_sz[MAX_LEVELS];
static uint8_t* G_io = nullptr;
static uint8_t* G_tmp_in = nullptr;
static int G_tmp_in_sz = 0;

struct Pending {
    int level, start, end, step, idx_s, idx_e;
};
static Pending G_pend[MAX_PENDING];
static int G_pcnt = 0;
static int G_retry[4];

static int floor_div(int a, int b) {
    return a / b - (a % b != 0 && (a ^ b) < 0);
}

static int fix_up_rem(int n, int m, int r) {
    int t = n % m;
    if (t <= r) return n - t + r;
    return n - t + m + r;
}

static int lv_len(int lv) {
    if (lv == 0) return G_total;
    int step = 1 << lv;
    int s = -step / 2;
    int e = fix_up_rem(G_total, step, step / 2) + 1;
    return (e - s - 1) / step + 1;
}

static void tr_r2c(const uint8_t* src, uint8_t* dst, int n, int v) {
    auto s = (const uint32_t*)src;
    auto d = (uint32_t*)dst;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < v; j++)
            d[j * n + i] = s[i * v + j];
}

static void tr_c2r(const uint8_t* src, uint8_t* dst, int n, int v) {
    auto s = (const uint32_t*)src;
    auto d = (uint32_t*)dst;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < v; j++)
            d[i * v + j] = s[j * n + i];
}

static int extract_whole(int lv, int cs, int n, uint8_t* dst) {
    auto c = G_whole[lv];
    int tp = G_whole_sz[lv] / 4 / G_vnum;
    for (int i = 0; i < G_vnum; i++)
        memcpy(dst + i * n * 4, c + tp * 4 * i + 4 * cs, n * 4);
    return n * 4 * G_vnum;
}

static void calc_req(Range* out) {
    for (int i = 0; i < MAX_LEVELS; i++) out[i].valid = 0;
    int lv = G_req_level, wm = G_req_wmax, rs = G_req_start, re = G_req_end;
    double mp = G_mouse;
    { // 当前 level
        double p = (double)(1 << lv);
        out[lv].start = (int)round((rs - 3.0 * wm * p) / p);
        out[lv].end = (int)round((re + 3.0 * wm * p) / p);
        out[lv].valid = 1;
    }
    for (int i = lv - 1; i >= lv - 4 && i >= 0; i--) {
        double p = (double)(1 << i);
        double mv = rs + mp * (re - rs);
        out[i].start = (int)round((mv - (1.0 + mp) * wm * p) / p);
        out[i].end = (int)round((mv + (2.0 - mp) * wm * p) / p);
        out[i].valid = 1;
    }
    for (int i = lv + 1; i <= lv + 4 && i <= G_max_lv; i++) {
        double p = (double)(1 << i);
        double mv = rs + mp * (re - rs);
        out[i].start = (int)round((mv - (1.0 + mp) * wm * p) / p);
        out[i].end = (int)round((mv + (2.0 - mp) * wm * p) / p);
        out[i].valid = 1;
    }
    for (int i = 0; i < MAX_LEVELS; i++)
        if (out[i].valid && G_whole[i]) out[i].valid = 0;
    for (int i = 0; i < MAX_LEVELS; i++) {
        if (!out[i].valid) continue;
        int me = lv_len(i);
        if (out[i].start < 0 && out[i].end > me) { out[i].start = 0; out[i].end = me; continue; }
        if (out[i].start < 0) { out[i].end -= out[i].start; out[i].start = 0; }
        if (out[i].end > me) { out[i].start -= (out[i].end - me); out[i].end = me; }
    }
}

static void calc_unne(Range* out) {
    for (int i = 0; i < MAX_LEVELS; i++) out[i].valid = 0;
    int lv = G_req_level, wm = G_req_wmax, rs = G_req_start, re = G_req_end;
    { // 当前 level (和 required 一样是 3x)
        double p = (double)(1 << lv);
        out[lv].start = (int)round((rs - 10.0 * wm * p) / p);
        out[lv].end = (int)round((re + 10.0 * wm * p) / p);
        out[lv].valid = 1;
    }
    for (int i = lv - 1; i >= lv - 7 && i >= 0; i--) {
        double p = (double)(1 << i);
        out[i].start = (int)round((rs - 5.0 * wm * p) / p);
        out[i].end = (int)round((re + 5.0 * wm * p) / p);
        out[i].valid = 1;
    }
    for (int i = lv + 1; i <= lv + 7 && i <= G_max_lv; i++) {
        double p = (double)(1 << i);
        out[i].start = (int)round((rs - 5.0 * wm * p) / p);
        out[i].end = (int)round((re + 5.0 * wm * p) / p);
        out[i].valid = 1;
    }
    for (int i = 0; i < MAX_LEVELS; i++)
        if (out[i].valid && G_whole[i]) out[i].valid = 0;
    for (int i = 0; i < MAX_LEVELS; i++) {
        if (!out[i].valid) continue;
        if (out[i].start < 0) out[i].start = 0;
        int me = lv_len(i);
        if (out[i].end > me) out[i].end = me;
    }
}

static void upd_data_range(Range* new_r) {
    for (int k = 0; k < MAX_LEVELS; k++) {
        int had = G_unne_rng[k].valid, has = new_r[k].valid;
        if (had && !has) {
            G_unne_rng[k].valid = 0;
            free(G_cd[k].status); G_cd[k].status = nullptr;
            free(G_cd[k].data); G_cd[k].data = nullptr;
            G_cd[k].len = 0;
            continue;
        }
        if (!has) continue;
        int ns = new_r[k].start, ne = new_r[k].end, nl = ne - ns;
        if (!had) {
            G_cd[k].status = (uint8_t*)calloc(nl, 1);
            G_cd[k].data = (uint8_t*)calloc(nl * 4 * G_vnum, 1);
            G_cd[k].len = nl;
            continue;
        }
        int os = G_unne_rng[k].start, oe = G_unne_rng[k].end;
        if (ns >= oe || os >= ne) {
            free(G_cd[k].status); free(G_cd[k].data);
            G_cd[k].status = (uint8_t*)calloc(nl, 1);
            G_cd[k].data = (uint8_t*)calloc(nl * 4 * G_vnum, 1);
            G_cd[k].len = nl;
            continue;
        }
        int ss = os > ns ? os : ns, se = oe < ne ? oe : ne;
        int sio = ss - os, sin_ = ss - ns, sl = se - ss;
        auto nst = (uint8_t*)calloc(nl, 1);
        auto ndt = (uint8_t*)calloc(nl * 4 * G_vnum, 1);
        memcpy(nst + sin_, G_cd[k].status + sio, sl);
        memcpy(ndt + sin_ * 4 * G_vnum, G_cd[k].data + sio * 4 * G_vnum, sl * 4 * G_vnum);
        free(G_cd[k].status); free(G_cd[k].data);
        G_cd[k].status = nst; G_cd[k].data = ndt; G_cd[k].len = nl;
    }
}

static void find_pending() {
    G_pcnt = 0;
    for (int k = 0; k < MAX_LEVELS; k++) {
        if (!G_req_rng[k].valid || !G_unne_rng[k].valid || !G_cd[k].status) continue;
        int gs = G_req_rng[k].start, ge = G_req_rng[k].end;
        int off = G_unne_rng[k].start, uend = G_unne_rng[k].end;
        if (gs < off) gs = off;
        if (ge > uend) ge = uend;
        if (gs >= ge) continue;
        int cs = -1;
        for (int i = gs; i < ge; i++) {
            if (cs == -1) {
                if (G_cd[k].status[i - off] == CACHE_FREE) cs = i;
            } else {
                if (G_cd[k].status[i - off] != CACHE_FREE) {
                    if (G_pcnt < MAX_PENDING) {
                        int step = 1 << k, as_, ae_;
                        if (k == 0) { as_ = cs; ae_ = cs + (i - cs - 1) * step + 1; }
                        else { as_ = cs * step - step / 2; ae_ = as_ + (i - cs - 1) * step + 1; }
                        G_pend[G_pcnt] = {k, as_, ae_, step, cs, i};
                        G_pcnt++;
                    }
                    cs = -1;
                }
            }
        }
        if (cs != -1 && G_pcnt < MAX_PENDING) {
            int step = 1 << k, as_, ae_;
            if (k == 0) { as_ = cs; ae_ = cs + (ge - cs - 1) * step + 1; }
            else { as_ = cs * step - step / 2; ae_ = as_ + (ge - cs - 1) * step + 1; }
            G_pend[G_pcnt] = {k, as_, ae_, step, cs, ge};
            G_pcnt++;
        }
    }
}

extern "C" {

void init(int total, int vnum, int max_cs) {
    G_total = total; G_vnum = vnum;
    G_max_lv = (int)floor(log2((double)total / 40.0));
    if (G_max_lv < 0) G_max_lv = 0;
    if (max_cs > 0) {
        G_max_cache_lv = (int)floor(log2((double)total / ((double)max_cs / 4.0 / (double)vnum)));
        if (G_max_cache_lv < 0) G_max_cache_lv = 0;
    } else {
        G_max_cache_lv = G_max_lv + 1;
    }
    memset(G_cd, 0, sizeof(G_cd));
    memset(G_req_rng, 0, sizeof(G_req_rng));
    memset(G_unne_rng, 0, sizeof(G_unne_rng));
    memset(G_whole, 0, sizeof(G_whole));
    memset(G_whole_sz, 0, sizeof(G_whole_sz));
    if (!G_io) G_io = (uint8_t*)malloc(IO_BUF_SIZE);
    G_pcnt = 0; G_has_req = 0; G_req_level = -1;
}

int get_max_level() { return G_max_lv; }
int get_max_cache_all_level() { return G_max_cache_lv; }
uint8_t* get_io_buffer() { return G_io; }

uint8_t* alloc_whole_cache(int lv, int sz) {
    if (G_whole[lv]) free(G_whole[lv]);
    G_whole[lv] = (uint8_t*)malloc(sz);
    G_whole_sz[lv] = sz;
    return G_whole[lv];
}

int has_whole_cache(int lv) { return G_whole[lv] ? 1 : 0; }
int get_has_request() { return G_has_req; }
int get_current_level() { return G_req_level; }
void clear_request() { G_has_req = 0; }
void set_mouse_pos(double p) { G_mouse = p; }

int access_data(int s, int e, int step, int ws, int wm) {
    G_req_start = s; G_req_end = e; G_req_step = step; G_req_wmax = wm;
    int lv = (int)round(log2((double)step));
    G_req_level = lv; G_has_req = 1;
    int n = floor_div(e - 1 - s, step) + 1;
    int cs = floor_div(s, step) + 1;
    if (lv == 0) cs = s;
    if (lv >= G_max_cache_lv && G_whole[lv]) { G_has_req = 0; return extract_whole(lv, cs, n, G_io); }
    if (G_cd[lv].status && G_unne_rng[lv].valid) {
        int us = G_unne_rng[lv].start, ue = G_unne_rng[lv].end;
        if (cs >= us && cs + n <= ue) {
            int ok = 1;
            for (int i = cs; i < cs + n; i++)
                if (G_cd[lv].status[i - us] != CACHE_LOADED) { ok = 0; break; }
            if (ok) {
                tr_r2c(G_cd[lv].data + (cs - us) * 4 * G_vnum, G_io, n, G_vnum);
                G_has_req = 0; return n * 4 * G_vnum;
            }
        }
    }
    return 0;
}

int access_from_cache(int s, int e, int step, int ws, int wm) {
    int lv = (int)round(log2((double)step));
    int n = floor_div(e - 1 - s, step) + 1;
    int cs = floor_div(s, step) + 1;
    if (lv == 0) cs = s;
    if (lv >= G_max_cache_lv && G_whole[lv]) { G_has_req = 0; return extract_whole(lv, cs, n, G_io); }
    if (G_cd[lv].status && G_unne_rng[lv].valid) {
        int us = G_unne_rng[lv].start, ue = G_unne_rng[lv].end;
        if (cs >= us && cs + n <= ue) {
            tr_r2c(G_cd[lv].data + (cs - us) * 4 * G_vnum, G_io, n, G_vnum);
            G_has_req = 0; return n * 4 * G_vnum;
        }
    }
    return -1;
}

void store_miss_response(int s, int e, int step, int dlen) {
    int lv = (int)round(log2((double)step));
    if (!G_cd[lv].status || !G_unne_rng[lv].valid) return;
    int n = floor_div(e - 1 - s, step) + 1;
    int ts = floor_div(s, step) + 1;
    if (lv == 0) ts = s;
    int te = ts + n;
    int us = G_unne_rng[lv].start, ue = G_unne_rng[lv].end;
    if (ts >= ue || te <= us) return;
    int tb = n * 4 * G_vnum;
    auto tmp = (uint8_t*)malloc(tb);
    tr_c2r(G_io, tmp, n, G_vnum);
    int ss = ts > us ? ts : us, se = te < ue ? te : ue, sl = se - ss;
    memcpy(G_cd[lv].data + (ss - us) * 4 * G_vnum, tmp + (ss - ts) * 4 * G_vnum, sl * 4 * G_vnum);
    memset(G_cd[lv].status + (ss - us), CACHE_LOADED, sl);
    free(tmp);
}

int update_cache_ranges(int mouse_only) {
    if (G_req_level == -1) return 0;
    calc_req(G_req_rng);
    if (!mouse_only) {
        Range new_unne[MAX_LEVELS];
        calc_unne(new_unne);
        upd_data_range(new_unne);
        memcpy(G_unne_rng, new_unne, sizeof(G_unne_rng));
    }
    find_pending();
    return G_pcnt;
}

Pending* get_pending_ptr() { return G_pend; }

uint8_t* alloc_temp_input(int sz) {
    if (sz > G_tmp_in_sz) {
        if (G_tmp_in) free(G_tmp_in);
        G_tmp_in = (uint8_t*)malloc(sz);
        G_tmp_in_sz = sz;
    }
    return G_tmp_in;
}

int write_preload_response(int lv, int cs, int ce, int dlen) {
    if (!G_unne_rng[lv].valid || !G_cd[lv].status) return 0;
    int us = G_unne_rng[lv].start, ue = G_unne_rng[lv].end;
    if (cs >= ue || ce <= us) return 0;
    int ss = cs > us ? cs : us, se = ce < ue ? ce : ue, sl = se - ss;
    int sir = ss - cs, sic = ss - us;
    memcpy(G_cd[lv].data + sic * 4 * G_vnum, G_tmp_in + sir * 4 * G_vnum, sl * 4 * G_vnum);
    memset(G_cd[lv].status + sic, CACHE_LOADED, sl);
    if (lv != G_req_level || !G_has_req) return 0;
    int step = 1 << lv;
    int rcs = floor_div(G_req_start, step) + 1;
    if (lv == 0) rcs = G_req_start;
    int rn = floor_div(G_req_end - 1 - G_req_start, step) + 1;
    int rce = rcs + rn;
    if (rcs < us || rce > ue) return 0;
    for (int i = rcs; i < rce; i++)
        if (G_cd[lv].status[i - us] != CACHE_LOADED) return 0;
    return 1;
}

void mark_requesting(int lv, int is, int ie) {
    if (!G_unne_rng[lv].valid || !G_cd[lv].status) return;
    int off = G_unne_rng[lv].start, uend = G_unne_rng[lv].end;
    if (is < off) is = off;
    if (ie > uend) ie = uend;
    if (is >= ie) return;
    memset(G_cd[lv].status + (is - off), CACHE_REQUESTING, ie - is);
}

int check_retry(int lv, int start, int end, int step) {
    if (!G_req_rng[lv].valid) return 0;
    int rs = G_req_rng[lv].start, re = G_req_rng[lv].end;
    if (start >= re || end <= rs) return 0;
    int ss = start > rs ? start : rs, se = end < re ? end : re;
    int as_, ae_;
    if (lv == 0) as_ = ss;
    else as_ = ss * step - step / 2;
    ae_ = as_ + (se - ss - 1) * step + 1;
    G_retry[0] = ss; G_retry[1] = se; G_retry[2] = as_; G_retry[3] = ae_;
    return 1;
}

int* get_retry_info() { return G_retry; }

void retry_mark(int lv, int start, int end) {
    if (!G_unne_rng[lv].valid || !G_cd[lv].status) return;
    int off = G_unne_rng[lv].start, uend = G_unne_rng[lv].end;
    if (start < off) start = off;
    if (end > uend) end = uend;
    for (int i = start; i < end; i++)
        if (G_cd[lv].status[i - off] == CACHE_FREE)
            G_cd[lv].status[i - off] = CACHE_REQUESTING;
}

} // extern "C"
