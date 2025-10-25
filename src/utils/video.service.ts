import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export interface HlsResult {
  manifestRelativePath: string;
  storageDirRelative: string;
  thumbnailRelativePath: string;
  durationSeconds: number;
}

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ffprobeDurationSeconds(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nokey=1:noprint_wrappers=1',
      inputPath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => {
      const val = parseFloat(out.trim());
      resolve(Number.isFinite(val) ? Math.round(val) : 0);
    });
    proc.on('error', () => resolve(0));
  });
}

export class VideoService {
  static async transcodeToHLS(tempInputPath: string, userId: string): Promise<HlsResult> {
    const publicDir = path.join(process.cwd(), 'public');
    const storageDir = path.join(publicDir, 'uploads', 'intro_videos', userId);
    ensureDirSync(storageDir);

    // Master manifest target
    const manifestName = 'master.m3u8';

    // Create renditions using HLS with multiple bitrates
    // 360p, 240p, 144p for low bandwidth
    const args = [
      '-y',
      '-i', tempInputPath,
      // 360p
      '-filter:v:0', 'scale=w=640:h=360:force_original_aspect_ratio=decrease',
      '-c:a:0', 'aac', '-ar:0', '48000', '-b:a:0', '96k',
      '-c:v:0', 'h264', '-profile:v:0', 'main', '-crf:0', '23', '-g:0', '48', '-keyint_min:0', '48', '-sc_threshold:0',
      // 240p
      '-filter:v:1', 'scale=w=426:h=240:force_original_aspect_ratio=decrease',
      '-c:a:1', 'aac', '-ar:1', '44100', '-b:a:1', '64k',
      '-c:v:1', 'h264', '-profile:v:1', 'baseline', '-crf:1', '24', '-g:1', '48', '-keyint_min:1', '48', '-sc_threshold:1',
      // 144p
      '-filter:v:2', 'scale=w=256:h=144:force_original_aspect_ratio=decrease',
      '-c:a:2', 'aac', '-ar:2', '44100', '-b:a:2', '48k',
      '-c:v:2', 'h264', '-profile:v:2', 'baseline', '-crf:2', '26', '-g:2', '48', '-keyint_min:2', '48', '-sc_threshold:2',
      // map streams
      '-map', '0:v', '-map', '0:a?',
      '-map', '0:v', '-map', '0:a?',
      '-map', '0:v', '-map', '0:a?',
      // HLS options
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(storageDir, 'v%v_segment_%03d.ts'),
      '-master_pl_name', manifestName,
      '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2',
      path.join(storageDir, 'v%v.m3u8'),
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed'))));
    });

    // Generate thumbnail
    const thumbPath = path.join(storageDir, 'thumb.jpg');
    await new Promise<void>((resolve) => {
      const p = spawn('ffmpeg', ['-y', '-i', tempInputPath, '-ss', '00:00:02', '-vframes', '1', thumbPath]);
      p.on('close', () => resolve());
      p.on('error', () => resolve());
    });

    const duration = await ffprobeDurationSeconds(tempInputPath);

    const storageDirRelative = path.posix.join('/uploads', 'intro_videos', userId);
    const manifestRelativePath = path.posix.join(storageDirRelative, manifestName);
    const thumbnailRelativePath = path.posix.join(storageDirRelative, 'thumb.jpg');

    return {
      manifestRelativePath,
      storageDirRelative,
      thumbnailRelativePath,
      durationSeconds: duration,
    };
  }
}
