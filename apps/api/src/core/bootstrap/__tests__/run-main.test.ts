// Açılış hatası (K8, D4): hata güvenli serileştiriciyle loglanır, log çıkıştan önce yazılmış olur,
// süreç 1 koduyla kapanır; ham hata mesajı veya stack stderr/stdout'a düşmez.
import { createServer, type Server } from 'node:net';
import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { LogCapture } from '../../../../test/http-app';
import { TEST_SERVER_ENV } from '../../../../test/env';
import { bootstrapApi } from '../../../app.bootstrap';
import { NEST_BOOTSTRAP_OPTIONS, runMain } from '../run-main';

const SECRET = 'gizli-ayrinti +994501234567';

@Module({})
class BrokenModule {
  static register(): DynamicModule {
    return {
      module: BrokenModule,
      providers: [
        {
          provide: 'BROKEN',
          useFactory: () => {
            throw new Error(SECRET);
          },
        },
      ],
    };
  }
}

interface ExitProbe {
  readonly codes: number[];
  linesAtExit: number;
}

function exitProbe(capture: LogCapture): ExitProbe & { exit: (code: number) => void } {
  const probe: ExitProbe & { exit: (code: number) => void } = {
    codes: [],
    linesAtExit: -1,
    exit: (code) => {
      probe.codes.push(code);
      probe.linesAtExit = capture.lines().length;
    },
  };
  return probe;
}

function written(spy: MockInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join('');
}

describe('runMain (açılış hatası)', () => {
  let stderr: MockInstance;
  let stdout: MockInstance;

  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    stdout.mockRestore();
  });

  it('K8: hata güvenli loglanır, log çıkıştan önce yazılır, çıkış kodu 1', async () => {
    const capture = new LogCapture();
    const probe = exitProbe(capture);

    await runMain('worker', () => Promise.reject(new Error(SECRET)), {
      destination: capture,
      exit: probe.exit,
    });

    expect(probe.codes).toEqual([1]);
    expect(probe.linesAtExit).toBe(1);
    const [line] = capture.lines();
    expect(line).toMatchObject({ level: 'fatal', service: 'worker', event: 'bootstrap.failed' });
    expect(line?.err).toMatchObject({ type: 'Error' });
    expect(capture.text()).not.toContain('gizli');
    expect(capture.text()).not.toContain('+994');
    expect(written(stderr)).toBe('');
  });

  it('K8: başarılı açılışta çıkış çağrılmaz, log yazılmaz', async () => {
    const capture = new LogCapture();
    const probe = exitProbe(capture);

    await runMain('api', () => Promise.resolve(), { destination: capture, exit: probe.exit });

    expect(probe.codes).toEqual([]);
    expect(capture.lines()).toEqual([]);
  });

  it("K8 (duman): Nest modül hatası ham olarak stderr/stdout'a basılmaz", async () => {
    const capture = new LogCapture();
    const probe = exitProbe(capture);

    await runMain(
      'worker',
      async () => {
        const app = await NestFactory.createApplicationContext(
          BrokenModule.register(),
          NEST_BOOTSTRAP_OPTIONS,
        );
        await app.close();
      },
      { destination: capture, exit: probe.exit },
    );

    expect(probe.codes).toEqual([1]);
    expect(probe.linesAtExit).toBe(1);
    expect(capture.text()).not.toContain('gizli');
    expect(written(stderr)).not.toContain('gizli');
    expect(written(stdout)).not.toContain('gizli');
  });

  describe('gerçek api açılışı (duman)', () => {
    let blocker: Server;
    let port: number;

    beforeEach(async () => {
      blocker = createServer();
      await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
      const address = blocker.address();
      port = typeof address === 'object' && address !== null ? address.port : 0;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) =>
        blocker.close(() => {
          resolve();
        }),
      );
    });

    it('K8 (duman): port doluyken api açılmaz; hata güvenli loglanır, çıkış 1', async () => {
      const capture = new LogCapture();
      const probe = exitProbe(capture);

      await runMain(
        'api',
        async () => {
          await bootstrapApi({ ...TEST_SERVER_ENV, PORT: port });
        },
        { destination: capture, exit: probe.exit },
      );

      expect(probe.codes).toEqual([1]);
      expect(probe.linesAtExit).toBe(1);
      const [line] = capture.lines();
      expect(line).toMatchObject({ event: 'bootstrap.failed', service: 'api' });
      expect(capture.text()).not.toContain(String(port));
      expect(written(stderr)).not.toMatch(/EADDRINUSE|address already in use/i);
      expect(written(stdout)).not.toMatch(/EADDRINUSE|address already in use/i);
    });
  });
});
