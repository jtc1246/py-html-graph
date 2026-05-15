#!/bin/bash
set -e
set -o pipefail
cd "$(readlink -f "$(dirname "$0")")"
source ~/.bashrc
conda activate wasm
EXPORTS="['_init','_get_max_level','_get_max_cache_all_level','_get_io_buffer','_alloc_whole_cache','_has_whole_cache','_access_data','_access_from_cache','_store_miss_response','_set_mouse_pos','_update_cache_ranges','_get_pending_ptr','_alloc_temp_input','_write_preload_response','_mark_requesting','_check_retry','_get_retry_info','_retry_mark','_get_has_request','_get_current_level','_clear_request']"
emcc cache_wasm.cpp -O3 --no-entry \
    -s EXPORTED_FUNCTIONS="$EXPORTS" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -o cache_wasm.wasm
echo "✅ cache_wasm.wasm 编译完成 ($(wc -c < cache_wasm.wasm) bytes)"
