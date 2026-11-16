export interface GeoGebraAPI {
  evalCommand(command: string): boolean;
  getAllObjectNames(): string[];
  deleteObject(name: string): void;
  reset(): void;
  setCoordSystem(xMin: number, xMax: number, yMin: number, yMax: number): void;
  setSize(width: number, height: number): void;
  getBase64(): string;
  getPNGBase64(scale?: number, transparent?: boolean, dpi?: number): string;
  setBase64(value: string): void;
}

export interface GGBAppletInstance {
  inject(container: string | HTMLElement): void;
  getAppletObject(): GeoGebraAPI;
}

declare global {
  interface Window {
    GGBApplet?: new (
      parameters: Record<string, unknown>,
      html5?: boolean,
    ) => GGBAppletInstance;
  }
}

export {};
