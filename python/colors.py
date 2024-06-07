import numpy as np
import matplotlib.pyplot as plt
from random import randint

LIGHTEST_THRESHOLD = 2.5


def initialize_colors(n, seed=42):
    # Set the seed for reproducibility
    np.random.seed(seed)
    # Initialize n random colors
    colors = np.random.rand(n, 3)
    for i in range(0, n):
        if (np.sum(colors[i]) > LIGHTEST_THRESHOLD):
            colors[i] = colors[i] / np.sum(colors[i]) * LIGHTEST_THRESHOLD
    return colors


def maximize_color_separation(colors, iterations=2000):
    n = len(colors)
    black = np.array([0, 0, 0])
    white = np.array([1, 1, 1])
    for _ in range(iterations):
        for i in range(n):
            current_color = colors[i]
            # Calculate distances from the current color to all other colors
            distances = np.sqrt(np.sum((colors - current_color) ** 2, axis=1))
            distances[i] = np.inf  # Ignore self-distance

            # Calculate distances from the extremes (black and white)
            distance_to_black = np.sqrt(np.sum((current_color - black) ** 2))
            distance_to_white = np.sqrt(np.sum((current_color - white) ** 2))

            # Find the closest color or extreme
            closest_distance = np.min(distances)
            closest_color = colors[np.argmin(distances)]

            # Determine the repulsion from closest color or extreme
            if closest_distance < distance_to_black and closest_distance < distance_to_white:
                direction = current_color - closest_color
            elif distance_to_black < distance_to_white:
                direction = current_color - black
            else:
                direction = current_color - white

            # Push away slightly from the closest threat
            colors[i] += direction * 0.02

            # Keep the color components within the adjusted range
            # colors[i] = np.clip(colors[i], 0, 0.9)
            colors[i] = np.clip(colors[i], 0, 1)
            if (np.sum(colors[i]) > LIGHTEST_THRESHOLD):
                colors[i] = colors[i] / np.sum(colors[i]) * LIGHTEST_THRESHOLD
    return colors


def plot_colors(hex_colors):
    """Plot colors that are provided in hexadecimal format."""
    plt.figure(figsize=(12, 2))
    for i, hex_color in enumerate(hex_colors):
        plt.fill_between([i, i+1], 0, 1, color=hex_color)
    plt.xlim(0, len(hex_colors))
    plt.axis('off')
    plt.show()

def score_colors(colors):
    black = np.array([0, 0, 0])
    white = np.array([1, 1, 1])
    score = 0

    for color in colors:
        distances = np.linalg.norm(colors - color, axis=1)
        distance_to_black = np.linalg.norm(color - black)
        distance_to_white = np.linalg.norm(color - white)

        min_distance = min(np.min(distances[distances > 0]), distance_to_black, distance_to_white)
        score += 1 / min_distance**5  # Add more penalty to very close colors

    return score

def np_to_hex(colors):
    result = []
    for color in colors:
        r = round(color[0] * 255)
        g = round(color[1] * 255)
        b = round(color[2] * 255)
        result.append(f'#{r:02x}{g:02x}{b:02x}')
    return result

def generate_colors(num: int, trial: int = 10, fixed=False):
    best_score = 10 * 100000000000
    best_colors = None
    if (fixed):
        seeds = list(range(1000, 1000 + trial * 10, 10))
    else:
        seeds = []
        for i in range(0, trial):
            seeds.append(randint(0, 1000000))
    for seed in seeds:
        colors = initialize_colors(num, seed)
        colors = maximize_color_separation(colors)
        score = score_colors(colors)
        if score < best_score:
            best_score = score
            best_colors = colors
    return np_to_hex(best_colors)

if __name__ == "__main__":
    colors = generate_colors(10, 10)
    plot_colors(colors)

