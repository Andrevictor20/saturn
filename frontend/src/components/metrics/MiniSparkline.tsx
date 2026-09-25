import React from 'react';

interface MiniSparklineProps {
  data: number[];
  color: string;
  gradientId: string;
  height?: number;
  min?: number;
  max?: number;
  fillOpacity?: number;
  strokeWidth?: number;
  showDot?: boolean;
  secondaryData?: number[];
  secondaryColor?: string;
  secondaryGradientId?: string;
}

const MiniSparklineComponent: React.FC<MiniSparklineProps> = ({
  data,
  color,
  gradientId,
  height = 42,
  min: propMin,
  max: propMax,
  fillOpacity = 0.25,
  strokeWidth = 2,
  showDot = true,
  secondaryData,
  secondaryColor = '#38bdf8',
  secondaryGradientId = 'sparkSecondary',
}) => {
  // Se não houver dados ou houver menos de 2 pontos, sintetizar uma linha inicial suave com base no valor
  const primaryPoints = React.useMemo(() => {
    if (!data || data.length === 0) {
      return [0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (data.length === 1) {
      const v = data[0];
      return [v, v, v, v, v, v, v, v];
    }
    // Pegar até os últimos 24 pontos para o mini gráfico
    return data.slice(-24);
  }, [data]);

  const secPoints = React.useMemo(() => {
    if (!secondaryData || secondaryData.length === 0) return null;
    if (secondaryData.length === 1) {
      const v = secondaryData[0];
      return [v, v, v, v, v, v, v, v];
    }
    return secondaryData.slice(-24);
  }, [secondaryData]);

  const width = 200;
  const h = height;

  // Calcular limites de escala
  const allValues = [...primaryPoints, ...(secPoints || [])];
  const calculatedMin = propMin !== undefined ? propMin : Math.min(0, ...allValues);
  const calculatedMax = propMax !== undefined ? propMax : Math.max(1, ...allValues);
  const range = calculatedMax - calculatedMin === 0 ? 1 : calculatedMax - calculatedMin;

  // Mapear pontos para coordenadas SVG (com margem de segurança de 4px para não cortar o traço)
  const padding = 4;
  const usableHeight = h - padding * 2;
  const stepX = width / (primaryPoints.length - 1 || 1);

  const getCoordinates = (points: number[]) => {
    return points.map((val, idx) => {
      const x = idx * stepX;
      const normalized = (val - calculatedMin) / range;
      // Inverter Y pois no SVG o topo é 0
      const y = h - padding - normalized * usableHeight;
      return { x, y };
    });
  };

  const primaryCoords = getCoordinates(primaryPoints);
  const secCoords = secPoints ? getCoordinates(secPoints) : null;

  // Gerar caminho suave SVG usando Curvas Catmull-Rom convertidas para Bézier Cúbico (suavidade orgânica)
  const createSmoothPath = (coords: { x: number; y: number }[]) => {
    if (coords.length === 0) return '';
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

    let path = `M ${coords[0].x} ${coords[0].y}`;

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = i > 0 ? coords[i - 1] : coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = i < coords.length - 2 ? coords[i + 2] : p2;

      // Catmull-Rom para Bézier cúbico contínuo (C1 continuity)
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }

    return path;
  };

  const primaryLinePath = createSmoothPath(primaryCoords);
  const secLinePath = secCoords ? createSmoothPath(secCoords) : '';

  // Gerar caminho de preenchimento da área sob a curva fechando até a base
  const primaryAreaPath = primaryCoords.length > 0
    ? `${primaryLinePath} L ${primaryCoords[primaryCoords.length - 1].x} ${h} L ${primaryCoords[0].x} ${h} Z`
    : '';

  const secAreaPath = secCoords && secCoords.length > 0
    ? `${secLinePath} L ${secCoords[secCoords.length - 1].x} ${h} L ${secCoords[0].x} ${h} Z`
    : '';

  const primaryLastPoint = primaryCoords[primaryCoords.length - 1];
  const secLastPoint = secCoords ? secCoords[secCoords.length - 1] : null;

  return (
    <div className="w-full overflow-hidden flex items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${h}`}
        className="w-full overflow-visible transition-all duration-300"
        style={{ height: `${h}px` }}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Gradiente da curva primária */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
            <stop offset="60%" stopColor={color} stopOpacity={fillOpacity * 0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>

          {/* Gradiente da curva secundária se existir */}
          {secondaryData && (
            <linearGradient id={secondaryGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondaryColor} stopOpacity={fillOpacity * 0.7} />
              <stop offset="100%" stopColor={secondaryColor} stopOpacity={0} />
            </linearGradient>
          )}
        </defs>

        {/* Área preenchida secundária */}
        {secAreaPath && (
          <path
            d={secAreaPath}
            fill={`url(#${secondaryGradientId})`}
            className="transition-all duration-300 pointer-events-none"
          />
        )}

        {/* Linha traçada secundária */}
        {secLinePath && (
          <path
            d={secLinePath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80 transition-all duration-300 pointer-events-none"
          />
        )}

        {/* Área preenchida primária */}
        {primaryAreaPath && (
          <path
            d={primaryAreaPath}
            fill={`url(#${gradientId})`}
            className="transition-all duration-300 pointer-events-none"
          />
        )}

        {/* Linha traçada primária com Bézier */}
        {primaryLinePath && (
          <path
            d={primaryLinePath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-300 pointer-events-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
          />
        )}

        {/* Ponto pulsante indicador em tempo real na curva primária */}
        {showDot && primaryLastPoint && (
          <g>
            <circle
              cx={primaryLastPoint.x}
              cy={primaryLastPoint.y}
              r={4}
              fill={color}
              className="animate-ping opacity-60"
            />
            <circle
              cx={primaryLastPoint.x}
              cy={primaryLastPoint.y}
              r={2.5}
              fill={color}
            />
          </g>
        )}

        {/* Ponto na curva secundária se existir */}
        {showDot && secLastPoint && (
          <g>
            <circle
              cx={secLastPoint.x}
              cy={secLastPoint.y}
              r={2}
              fill={secondaryColor}
            />
          </g>
        )}
      </svg>
    </div>
  );
};

export const MiniSparkline = React.memo(MiniSparklineComponent);
