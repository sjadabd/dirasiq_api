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

function ffprobeHasAudio(inputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      inputPath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => {
      resolve(out.trim().length > 0);
    });
    proc.on('error', () => resolve(false));
  });
}

export class VideoService {
  static async transcodeToHLS(tempInputPath: string, userId: string): Promise<HlsResult> {
    const publicDir = path.join(process.cwd(), 'public');
    const storageDir = path.join(publicDir, 'uploads', 'intro_videos', userId);
    // Hard-delete any previous video/thumbnail for this user, then recreate folder
    if (fs.existsSync(storageDir)) {
      try {
        fs.rmSync(storageDir, { recursive: true, force: true });
      } catch {}
    }
    ensureDirSync(storageDir);

    // Master manifest target
    const manifestName = 'master.m3u8';

    // Detect if input has audio to build proper mapping
    const hasAudio = await ffprobeHasAudio(tempInputPath);

    // Build filter_complex to split video into 3 renditions
    const filterComplex = [
      '[0:v]split=3[v0][v1][v2];',
      '[v0]scale=w=-2:h=360[v0out];',
      '[v1]scale=w=-2:h=240[v1out];',
      '[v2]scale=w=-2:h=144[v2out]'
    ].join('');

    const buildArgs = (videoEncoder: 'libx264' | 'h264') => {
      // Ensure real directory exists matching the posix path under OS temp or map to storageDir with posix join
      const outSegmentPath = path.posix.join(path.posix.normalize(storageDir.replace(/\\/g, '/')), 'v%v_segment_%03d.ts');
      const outManifestPath = path.posix.join(path.posix.normalize(storageDir.replace(/\\/g, '/')), 'v%v.m3u8');

      const args: string[] = [
        '-y',
        '-i', tempInputPath,
        '-filter_complex', filterComplex,
        // Map 360p
        '-map', '[v0out]',
        ...(hasAudio ? ['-map', '0:a:0?'] : []),
        '-c:v:0', videoEncoder, '-profile:v:0', 'main', '-crf:v:0', '23', '-g:v:0', '48', '-keyint_min:v:0', '48', '-sc_threshold:v:0', '0', '-pix_fmt:v:0', 'yuv420p', '-preset:v:0', 'veryfast',
        ...(hasAudio ? ['-c:a:0', 'aac', '-ar:a:0', '48000', '-b:a:0', '96k'] : []),
        // Map 240p
        '-map', '[v1out]',
        ...(hasAudio ? ['-map', '0:a:0?'] : []),
        '-c:v:1', videoEncoder, '-profile:v:1', 'baseline', '-crf:v:1', '24', '-g:v:1', '48', '-keyint_min:v:1', '48', '-sc_threshold:v:1', '0', '-pix_fmt:v:1', 'yuv420p', '-preset:v:1', 'veryfast',
        ...(hasAudio ? ['-c:a:1', 'aac', '-ar:a:1', '44100', '-b:a:1', '64k'] : []),
        // Map 144p
        '-map', '[v2out]',
        ...(hasAudio ? ['-map', '0:a:0?'] : []),
        '-c:v:2', videoEncoder, '-profile:v:2', 'baseline', '-crf:v:2', '26', '-g:v:2', '48', '-keyint_min:v:2', '48', '-sc_threshold:v:2', '0', '-pix_fmt:v:2', 'yuv420p', '-preset:v:2', 'veryfast',
        ...(hasAudio ? ['-c:a:2', 'aac', '-ar:a:2', '44100', '-b:a:2', '48k'] : []),
        // HLS options
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', outSegmentPath,
        '-master_pl_name', manifestName,
        '-var_stream_map', hasAudio ? 'v:0,a:0 v:1,a:1 v:2,a:2' : 'v:0 v:1 v:2',
        outManifestPath,
      ];
      return args;
    };

    const tryRun = (args: string[]) => new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let err = '';
      proc.stderr.on('data', (d) => (err += d.toString()));
      proc.on('error', (e) => reject(e));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'ffmpeg failed'))));
    });

    try {
      await tryRun(buildArgs('libx264'));
    } catch (e) {
      // Fallback to built-in h264 encoder name if libx264 is missing
      await tryRun(buildArgs('h264'));
    }

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
