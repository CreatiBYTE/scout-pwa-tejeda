import { Injectable } from '@angular/core';
import { PointOfInterest } from '../models/config.model';

export interface Coordinates {
  latitud: number;
  longitud: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeoService {

  constructor() { }

  // Convertir grados a radianes
  private toRadians(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  // Convertir radianes a grados
  private toDegrees(radians: number): number {
    return radians * 180 / Math.PI;
  }

  /**
   * Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine.
   * @param coord1 Coordenadas del primer punto {latitud, longitud}
   * @param coord2 Coordenadas del segundo punto {latitud, longitud}
   * @returns Distancia en metros
   */
  calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const phi1 = this.toRadians(coord1.latitud);
    const phi2 = this.toRadians(coord2.latitud);
    const deltaPhi = this.toRadians(coord2.latitud - coord1.latitud);
    const deltaLambda = this.toRadians(coord2.longitud - coord1.longitud);

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
  }

  /**
   * Calcula el rumbo (bearing) inicial desde el punto 1 al punto 2.
   * @param coord1 Coordenadas del primer punto {latitud, longitud}
   * @param coord2 Coordenadas del segundo punto {latitud, longitud}
   * @returns Rumbo en grados (0-360, 0 = Norte)
   */
  calculateBearing(coord1: Coordinates, coord2: Coordinates): number {
    const lat1 = this.toRadians(coord1.latitud);
    const lon1 = this.toRadians(coord1.longitud);
    const lat2 = this.toRadians(coord2.latitud);
    const lon2 = this.toRadians(coord2.longitud);

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    let brng = this.toDegrees(Math.atan2(y, x));

    // Normalizar a 0-360 grados
    brng = (brng + 360) % 360;
    return brng;
  }

  /**
   * Calcula la distancia perpendicular de un punto a un segmento de línea.
   * @param p El punto {latitud, longitud}
   * @param a El inicio del segmento de línea {latitud, longitud}
   * @param b El final del segmento de línea {latitud, longitud}
   * @returns Distancia en metros.
   *  Esta es una simplificación para un plano, para distancias geográficas cortas es una aproximación.
   *  Para mayor precisión, se necesitarían proyecciones geodésicas.
   */
  distanceToLineSegment(p: Coordinates, a: Coordinates, b: Coordinates): number {
    // Convertir a un sistema cartesiano aproximado (Equirectangular projection)
    // Esto es una simplificación y funciona razonablemente para distancias cortas.
    const R = 6371e3; // Radio de la Tierra
    const xP = R * this.toRadians(p.longitud) * Math.cos(this.toRadians((a.latitud + b.latitud) / 2)); // Usar latitud media para la escala de longitud
    const yP = R * this.toRadians(p.latitud);
    const xA = R * this.toRadians(a.longitud) * Math.cos(this.toRadians((a.latitud + b.latitud) / 2));
    const yA = R * this.toRadians(a.latitud);
    const xB = R * this.toRadians(b.longitud) * Math.cos(this.toRadians((a.latitud + b.latitud) / 2));
    const yB = R * this.toRadians(b.latitud);

    const l2 = (xB - xA) ** 2 + (yB - yA) ** 2; // Cuadrado de la longitud del segmento
    if (l2 === 0) return this.calculateDistance(p, a); // a y b son el mismo punto

    // Proyección de p sobre la línea que pasa por a y b
    let t = ((xP - xA) * (xB - xA) + (yP - yA) * (yB - yA)) / l2;
    t = Math.max(0, Math.min(1, t)); // Clampear t entre 0 y 1 para estar en el segmento

    const projectionX = xA + t * (xB - xA);
    const projectionY = yA + t * (yB - yA);

    // Distancia entre p y su proyección
    return Math.sqrt((xP - projectionX) ** 2 + (yP - projectionY) ** 2);
  }
}