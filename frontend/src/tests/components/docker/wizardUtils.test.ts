import { describe, it, expect } from 'vitest';
import { buildComposeYaml, type ComposeWizardConfig } from '../../../components/docker/wizardUtils';

describe('wizardUtils: buildComposeYaml', () => {
  it('generates basic compose with image and name', () => {
    const config: ComposeWizardConfig = {
      serviceName: 'my-app',
      image: 'nginx:alpine',
      restartPolicy: 'unless-stopped',
      networkMode: 'bridge',
      ports: [],
      volumes: [],
      envVars: [],
    };

    const { yaml, name } = buildComposeYaml(config);
    expect(name).toBe('my-app');
    expect(yaml).toContain('services:');
    expect(yaml).toContain('  my-app:');
    expect(yaml).toContain('    image: nginx:alpine');
    expect(yaml).toContain('    container_name: my-app');
    expect(yaml).toContain('    restart: unless-stopped');
    expect(yaml).not.toContain('ports:');
    expect(yaml).not.toContain('volumes:');
  });

  it('formats ports, volumes, and environment variables correctly', () => {
    const config: ComposeWizardConfig = {
      serviceName: 'Web Server',
      image: 'httpd:2.4',
      restartPolicy: 'always',
      networkMode: 'bridge',
      ports: [
        { id: '1', hostPort: '8080', containerPort: '80', protocol: 'tcp' },
        { id: '2', hostPort: '5353', containerPort: '53', protocol: 'udp' },
      ],
      volumes: [
        { id: '1', hostPath: '/DATA/html', containerPath: '/usr/local/apache2/htdocs', mode: 'ro' },
      ],
      envVars: [
        { id: '1', key: 'DEBUG', value: '1' },
      ],
    };

    const { yaml, name } = buildComposeYaml(config);
    expect(name).toBe('web-server');
    expect(yaml).toContain('    ports:');
    expect(yaml).toContain('      - "8080:80"');
    expect(yaml).toContain('      - "5353:53/udp"');
    expect(yaml).toContain('    volumes:');
    expect(yaml).toContain('      - "/DATA/html:/usr/local/apache2/htdocs:ro"');
    expect(yaml).toContain('    environment:');
    expect(yaml).toContain('      - DEBUG=1');
  });

  it('supports host network mode and ignores port mapping', () => {
    const config: ComposeWizardConfig = {
      serviceName: 'host-service',
      image: 'myapp:latest',
      restartPolicy: 'no',
      networkMode: 'host',
      ports: [{ id: '1', hostPort: '80', containerPort: '80', protocol: 'tcp' }],
      volumes: [],
      envVars: [],
    };

    const { yaml } = buildComposeYaml(config);
    expect(yaml).toContain('    network_mode: host');
    expect(yaml).not.toContain('    ports:');
  });
});
