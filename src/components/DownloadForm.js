import React, { useState, useRef } from 'react';

const API_URL = 'http://127.0.0.1:8000';
// const API_URL = 'https://y-downloader.duckdns.org';

function getFilenameFromCD(cd) {
    if (!cd) return null;
    // Prefer RFC 5987 encoded name
    const m1 = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m1) {
        try { return decodeURIComponent(m1[1]); } catch {}
    }
    const m2 = /filename="?([^";]+)"?/i.exec(cd);
    return m2 ? m2[1] : null;
}

export default function DownloadForm() {
    const [url, setUrl] = useState('');
    const [quality, setQuality] = useState('720p');
    const [phase, setPhase] = useState('idle'); // idle | preparing | downloading | transferring | error
    const [progress, setProgress] = useState(0);
    const [speed, setSpeed] = useState('');
    const [eta, setEta] = useState('');
    const [err, setErr] = useState(null);
    const inputRef = useRef(null);
    const pollRef = useRef(null);

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr(null);
        setProgress(0);
        setSpeed('');
        setEta('');

        const trimmed = url.trim();
        if (!trimmed) {
            setErr('Please paste a YouTube URL.');
            inputRef.current?.focus();
            return;
        }

        setPhase('preparing');
        try {
            // 1. Start the download task on the server
            const startRes = await fetch(`${API_URL}/api/download-yt/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: trimmed, quality }),
            });
            if (!startRes.ok) {
                const j = await startRes.json().catch(() => ({}));
                throw new Error(j?.error || `Server error ${startRes.status}`);
            }
            const { task_id } = await startRes.json();

            // 2. Poll for yt-dlp progress (server-side download)
            setPhase('downloading');
            await new Promise((resolve, reject) => {
                pollRef.current = setInterval(async () => {
                    try {
                        const r = await fetch(`${API_URL}/api/progress/${task_id}/`);
                        if (!r.ok) throw new Error(`Progress check failed: ${r.status}`);
                        const data = await r.json();

                        if (data.status === 'error') {
                            stopPolling();
                            reject(new Error(data.error || 'Download failed on server'));
                            return;
                        }

                        setProgress(data.percent || 0);
                        setSpeed(data.speed || '');
                        setEta(data.eta || '');

                        if (data.status === 'complete') {
                            stopPolling();
                            resolve();
                        }
                    } catch (pollErr) {
                        stopPolling();
                        reject(pollErr);
                    }
                }, 1000);
            });

            // 3. Transfer the file to the browser with progress tracking
            setPhase('transferring');
            setProgress(0);

            const fileRes = await fetch(`${API_URL}/api/download/${task_id}/`);
            if (!fileRes.ok) {
                const j = await fileRes.json().catch(() => ({}));
                throw new Error(j?.error || `Download error ${fileRes.status}`);
            }

            const contentLength = +fileRes.headers.get('Content-Length') || 0;
            const cd = fileRes.headers.get('Content-Disposition');
            const filename = getFilenameFromCD(cd) || 'video.mp4';

            const reader = fileRes.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                if (contentLength > 0) {
                    setProgress(Math.round((received / contentLength) * 100));
                }
            }

            const blob = new Blob(chunks, { type: 'video/mp4' });
            const dlUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = dlUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(dlUrl);

            setUrl('');
            setPhase('idle');
            setProgress(0);
        } catch (e) {
            stopPolling();
            setErr(e?.message || 'Something went wrong');
            setPhase('error');
        }
    };

    const isActive = phase === 'preparing' || phase === 'downloading' || phase === 'transferring';

    const phaseLabel = {
        preparing: 'Preparing…',
        downloading: 'Downloading on server…',
        transferring: 'Saving to device…',
    };

    const isIndeterminate = phase === 'preparing' || (phase === 'downloading' && progress === 0);

    return (
        <div style={styles.wrapper}>
            <form onSubmit={handleSubmit} style={styles.form}>
                <label htmlFor="yturl" style={styles.label}>YouTube URL</label>
                <input
                    id="yturl"
                    ref={inputRef}
                    type="url"
                    inputMode="url"
                    placeholder="https://youtu.be/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isActive}
                    required
                    style={styles.input}
                />
                <div style={styles.qualityRow}>
                    {[
                        { value: '720p',  label: '720p',       sub: 'HD' },
                        { value: '1080p', label: '1080p',      sub: 'Full HD' },
                        { value: '4k',    label: '4K',         sub: 'Ultra HD' },
                    ].map(({ value, label, sub }) => (
                        <button
                            key={value}
                            type="button"
                            disabled={isActive}
                            onClick={() => setQuality(value)}
                            style={{
                                ...styles.qualityBtn,
                                background: quality === value ? '#2563eb' : '#f3f4f6',
                                color: quality === value ? '#fff' : '#374151',
                                border: quality === value ? '2px solid #2563eb' : '2px solid transparent',
                                cursor: isActive ? 'not-allowed' : 'pointer',
                                opacity: isActive ? 0.6 : 1,
                            }}
                        >
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                            <span style={{ fontSize: 11, opacity: 0.8 }}>{sub}</span>
                        </button>
                    ))}
                </div>

                <button
                    type="submit"
                    disabled={isActive}
                    style={{
                        ...styles.button,
                        background: isActive ? '#9ca3af' : '#2563eb',
                        cursor: isActive ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isActive ? phaseLabel[phase] : 'Download'}
                </button>

                {isActive && (
                    <div style={styles.progressContainer}>
                        <div style={styles.progressTrack}>
                            <div
                                style={{
                                    ...styles.progressBar,
                                    width: isIndeterminate ? '40%' : `${progress}%`,
                                    animation: isIndeterminate ? 'slide 1.4s ease-in-out infinite' : 'none',
                                }}
                            />
                        </div>
                        <div style={styles.progressMeta}>
                            <span>
                                {phase === 'preparing'
                                    ? 'Starting…'
                                    : phase === 'transferring'
                                    ? `Saving to disk — ${progress}%`
                                    : progress > 0
                                    ? `${progress.toFixed(1)}%`
                                    : 'Starting yt-dlp…'}
                            </span>
                            <span style={{ color: '#9ca3af' }}>
                                {speed && `${speed}`}
                                {eta && eta !== '00:00' && ` · ETA ${eta}`}
                            </span>
                        </div>
                    </div>
                )}

                {err && <p style={styles.error}>{err}</p>}
                <p style={styles.hint}>
                    Video is fetched on the server at the selected quality, then downloaded to your browser.
                </p>
            </form>

            <style>{`
                @keyframes slide {
                    0%   { margin-left: 0;    margin-right: 60%; }
                    50%  { margin-left: 30%;  margin-right: 0;   }
                    100% { margin-left: 0;    margin-right: 60%; }
                }
            `}</style>
        </div>
    );
}

const styles = {
    wrapper: { maxWidth: 520, margin: '24px auto' },
    form: { display: 'grid', gap: 12 },
    label: { fontWeight: 600 },
    input: {
        padding: '10px 12px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid #c9ccd1',
    },
    button: {
        padding: '10px 14px',
        fontSize: 16,
        borderRadius: 8,
        border: 'none',
        color: '#fff',
        fontWeight: 600,
        transition: 'background 0.2s',
    },
    qualityRow: { display: 'flex', gap: 8 },
    qualityBtn: {
        flex: 1,
        padding: '8px 4px',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        transition: 'all 0.15s',
    },
    progressContainer: { display: 'grid', gap: 6 },
    progressTrack: {
        height: 8,
        background: '#e5e7eb',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        background: '#2563eb',
        borderRadius: 4,
        transition: 'width 0.3s ease',
    },
    progressMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
        color: '#6b7280',
    },
    error: { color: '#b00020', margin: 0 },
    hint: { color: '#6b7280', fontSize: 13, margin: 0 },
};
