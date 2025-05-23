export interface PointOfInterest {
  orden: number;
  nombrePOI: string;
  latitud: number;
  longitud: number;
  reached?: boolean; // <--- AÑADE ESTA PROPIEDAD COMO OPCIONAL
}

export interface EventConfig {
  nombreEvento: string;
  fechaInicio: string;
  horaInicio: string;
  fechaFin: string;
  horaFin: string;
  equipos: string[];
  ruta: PointOfInterest[];
}