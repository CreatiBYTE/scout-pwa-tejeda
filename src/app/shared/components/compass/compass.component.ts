import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, OnInit } from '@angular/core'; // Añadir OnInit
import { CommonModule } from '@angular/common';

interface Tick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isMajor: boolean;
}

@Component({
  selector: 'app-compass',
  standalone: true,
  imports: [CommonModule], // CommonModule para *ngFor si lo usamos en el template
  templateUrl: './compass.component.html',
  styleUrls: ['./compass.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompassComponent implements OnChanges, OnInit { // Implementar OnInit
  @Input() deviceOrientation: number = 0;
  @Input() bearingToPOI: number = 0;

  compassRotationStyle: string = 'rotate(0)';
  arrowRotationStyle: string = 'rotate(0)';

  ticks: Tick[] = []; // Array para almacenar los datos de los guiones

  // Constantes para el diseño de la brújula
  private readonly CENTER_X = 50;
  private readonly CENTER_Y = 50;
  private readonly COMPASS_RADIUS = 48; // Radio del círculo principal
  private readonly MAJOR_TICK_OUTER_RADIUS = 47; // Ligeramente dentro del borde
  private readonly MAJOR_TICK_INNER_RADIUS = 42;
  private readonly MINOR_TICK_OUTER_RADIUS = 47;
  private readonly MINOR_TICK_INNER_RADIUS = 44;
  private readonly DEGREE_INCREMENT = 5; // Un guion cada 5 grados
  private readonly MAJOR_TICK_EVERY_DEGREES = 30; // Guion principal cada 30 grados

  constructor() {}

  ngOnInit(): void {
    this.generateTicks(); // Generar los guiones al inicializar el componente
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['deviceOrientation'] || changes['bearingToPOI']) {
      this.updateRotations();
    }
  }

  private generateTicks(): void {
    this.ticks = [];
    for (let angle = 0; angle < 360; angle += this.DEGREE_INCREMENT) {
      const isMajor = angle % this.MAJOR_TICK_EVERY_DEGREES === 0;
      const outerR = isMajor ? this.MAJOR_TICK_OUTER_RADIUS : this.MINOR_TICK_OUTER_RADIUS;
      const innerR = isMajor ? this.MAJOR_TICK_INNER_RADIUS : this.MINOR_TICK_INNER_RADIUS;

      // Convertir ángulo a radianes (SVG usa sistema de coordenadas donde 0 grados es a las 3 en punto,
      // pero nuestra "N" está arriba, así que necesitamos ajustar o ser consistentes)
      // Para SVG, 0 grados es el eje X positivo. El ángulo en transformaciones rotate() es horario.
      // Para que 0° sea "arriba" (como la N), restamos 90° o usamos (angle - 90).
      const rad = (angle - 90) * Math.PI / 180; // -90 para que 0° sea arriba

      this.ticks.push({
        x1: this.CENTER_X + innerR * Math.cos(rad),
        y1: this.CENTER_Y + innerR * Math.sin(rad),
        x2: this.CENTER_X + outerR * Math.cos(rad),
        y2: this.CENTER_Y + outerR * Math.sin(rad),
        isMajor: isMajor
      });
    }
  }

  private updateRotations(): void {
    const devOrientation = Number(this.deviceOrientation) || 0;
    const bearing = Number(this.bearingToPOI) || 0;

    const compassAngle = -devOrientation;
    this.compassRotationStyle = `rotate(${compassAngle.toFixed(2)})`;

    const arrowRotationAngle = bearing - devOrientation;
    this.arrowRotationStyle = `rotate(${arrowRotationAngle.toFixed(2)})`;
  }
}