declare module 'wcag-contrast' {
  export function luminance(rgb: [number, number, number]): number
  export function rgb(a: [number, number, number], b: [number, number, number]): number
  export function hex(a: string, b: string): number
  export function score(ratio: number): string
}
