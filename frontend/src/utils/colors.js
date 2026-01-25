import {
    interpolateTurbo,
    interpolateViridis,
    interpolatePlasma,
    interpolateInferno,
    interpolateMagma,
    interpolateCividis,
    interpolateWarm,
    interpolateCool,
    interpolateRdYlBu,
    interpolateSpectral
} from "d3-scale-chromatic";
import { rgb as d3Rgb } from "d3-color";

export const PALETTE = [
    [59, 130, 246],
    [236, 72, 153],
    [34, 197, 94],
    [249, 115, 22],
    [162, 28, 175],
    [251, 191, 36],
    [20, 184, 166],
    [248, 113, 113],
    [147, 197, 253],
    [250, 204, 21],
];

// Available color scales for continuous data
export const COLOR_SCALES = {
    turbo: { name: "Turbo", interpolator: interpolateTurbo },
    viridis: { name: "Viridis", interpolator: interpolateViridis },
    plasma: { name: "Plasma", interpolator: interpolatePlasma },
    inferno: { name: "Inferno", interpolator: interpolateInferno },
    magma: { name: "Magma", interpolator: interpolateMagma },
    cividis: { name: "Cividis", interpolator: interpolateCividis },
    warm: { name: "Warm", interpolator: interpolateWarm },
    cool: { name: "Cool", interpolator: interpolateCool },
    rdylbu: { name: "RdYlBu", interpolator: interpolateRdYlBu },
    spectral: { name: "Spectral", interpolator: interpolateSpectral }
};

// Generate CSS gradient for colorbar visualization
export function generateColorbarGradient(interpolator, steps = 20) {
    const colors = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const color = d3Rgb(interpolator(t));
        colors.push(`rgb(${color.r}, ${color.g}, ${color.b})`);
    }
    return `linear-gradient(to right, ${colors.join(', ')})`;
}
