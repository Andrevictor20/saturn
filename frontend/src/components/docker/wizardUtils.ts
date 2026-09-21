export interface PortEntry {
  id: string;
  hostPort: string;
  containerPort: string;
  protocol: 'tcp' | 'udp';
  isAvailable?: boolean | null;
  checking?: boolean;
}

export interface VolumeEntry {
  id: string;
  hostPath: string;
  containerPath: string;
  mode: 'rw' | 'ro';
}

export interface EnvEntry {
  id: string;
  key: string;
  value: string;
}

export const POPULAR_IMAGES = [
  'nginx:alpine',
  'redis:alpine',
  'postgres:16-alpine',
  'mariadb:lts',
  'node:lts-alpine',
  'python:3.11-slim',
  'caddy:alpine',
];

export interface ComposeWizardConfig {
  serviceName: string;
  image: string;
  restartPolicy: string;
  networkMode: string;
  ports: PortEntry[];
  volumes: VolumeEntry[];
  envVars: EnvEntry[];
}

export function buildComposeYaml(config: ComposeWizardConfig): { yaml: string; name: string } {
  const { serviceName, image, restartPolicy, networkMode, ports, volumes, envVars } = config;
  const cleanName = (serviceName.trim() || image.split(':')[0].split('/').pop() || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');

  const lines: string[] = [
    'services:',
    `  ${cleanName}:`,
    `    image: ${image.trim()}`,
    `    container_name: ${cleanName}`,
    `    restart: ${restartPolicy}`,
  ];

  if (networkMode === 'host') {
    lines.push('    network_mode: host');
  }

  // Ports
  const validPorts = ports.filter((p) => p.hostPort.trim() && p.containerPort.trim());
  if (validPorts.length > 0 && networkMode !== 'host') {
    lines.push('    ports:');
    for (const p of validPorts) {
      const proto = p.protocol === 'udp' ? '/udp' : '';
      lines.push(`      - "${p.hostPort.trim()}:${p.containerPort.trim()}${proto}"`);
    }
  }

  // Volumes
  const validVolumes = volumes.filter((v) => v.hostPath.trim() && v.containerPath.trim());
  if (validVolumes.length > 0) {
    lines.push('    volumes:');
    for (const v of validVolumes) {
      lines.push(`      - "${v.hostPath.trim()}:${v.containerPath.trim()}:${v.mode}"`);
    }
  }

  // Environment
  const validEnv = envVars.filter((e) => e.key.trim());
  if (validEnv.length > 0) {
    lines.push('    environment:');
    for (const e of validEnv) {
      lines.push(`      - ${e.key.trim()}=${e.value.trim()}`);
    }
  }

  return { yaml: lines.join('\n'), name: cleanName };
}
