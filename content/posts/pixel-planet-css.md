---
title: "A planet that denoises itself, in pure CSS"
date: 2026-10-28
slug: pixel-planet-css
lede: "The banner on my profile loops from noise to a pixel planet and back. There is no JavaScript: two noise layers, one opacity schedule, and a few rules about pixel grids that I learned the hard way."
tags: [svg, css, generative]
---

<figure><img class="only-light" src="/img/planet-light.svg" alt="Pixel-art planet with a ring and a moon emerging from noise"><img class="only-dark" src="/img/planet-dark.svg" alt=""></figure>

GitHub renders a profile's SVGs as images, so they cannot run scripts. CSS animations inside the SVG still play, and that turned out to be enough for a small diffusion-style loop.

## Blending is just opacity

Every cell is drawn three times. The clean scene, x<sub>0</sub>, sits at the bottom; two layers of random grey noise sit on top. With opacities a<sub>1</sub> and a<sub>2</sub>, the share of noise you see is 1 − (1 − a<sub>1</sub>)(1 − a<sub>2</sub>). So for a target noise level L at time t, I fix the second layer and solve for the first:

```python
a2 = L * s                    # s wobbles around 0.5, so the grain shimmers
a1 = 1 - (1 - L) / (1 - a2)   # makes 1 - (1 - a1) * (1 - a2) equal L
```

Only the two layer opacities animate. The 1,152 cells underneath never change, which keeps the file small and the browser relaxed. L follows a cosine schedule: 1.7 seconds of denoising, five seconds of clean scene, then 1.7 seconds of re-noising as a mirror image.

## Everything that moves snaps to the grid

The clean scene is alive too. The planet's banded surface slides one column at a time behind a pixel-shaped mask, which reads as rotation. A moon orbits in the plane of the ring, and a comet crosses once per loop.

My first moon moved smoothly, and during the pure-noise phase it peeked through the 1.25 px gaps between noise cells, because the noise layers only cover cells. Making everything move in whole cells fixed it: the moon hops along precomputed orbit positions, and the comet advances two cells right and one down per frame.

## Occlusion with two copies

The moon is drawn twice, once beneath the planet and once above it, and the upper copy is only visible on the near half of the orbit. The ring works the same way: its back half is drawn under the planet, its front half over it.

## The bug that wasn't

The comet seemed not to render. I suspected positive `animation-delay` inside SVG images and moved its timing into the keyframes, then sampled the pixels where its head should be. It had been rendering all along, as one faint cell. It now has a bright head, a halo and a seven-cell trail.

Everything respects `prefers-reduced-motion`: with motion reduced, you get the clean planet and nothing moves.
