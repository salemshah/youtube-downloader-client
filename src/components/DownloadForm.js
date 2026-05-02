import React, { useState, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${Math.round(bytes / 1e3)} KB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DownloadForm() {
    const [url, setUrl]               = useState('');
    const [loading, setLoading]       = useState(false);
    const [videoInfo, setVideoInfo]   = useState(null);
    const [err, setErr]               = useState(null);

    // quality string of the stream currently being server-processed, or null
    const [serverBusy, setServerBusy] = useState(null);
    const [serverErr, setServerErr]   = useState(null);
    const inputRef = useRef(null);

    // -----------------------------------------------------------------------
    // Step 1 — fetch metadata
    // -----------------------------------------------------------------------
    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) {
            setErr('Please paste a YouTube URL.');
            inputRef.current?.focus();
            return;
        }

        setErr(null);
        setVideoInfo(null);
        setLoading(true);

        try {
            const res  = await fetch(`${API_URL}/api/extract/`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ url: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
            if (!data.streams?.length) throw new Error('No downloadable streams found for this video.');

            // Store the original URL so the download endpoint can re-validate it
            setVideoInfo({ ...data, originalUrl: trimmed });
        } catch (e) {
            setErr(e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Step 2a — direct download (client-side, no server involvement)
    // -----------------------------------------------------------------------
    // Rendered as a plain <a href> — browser downloads straight from YouTube CDN.

    // -----------------------------------------------------------------------
    // Step 2b — server-required download (1080p+)
    // -----------------------------------------------------------------------
    const handleServerDownload = async (stream) => {
        setServerBusy(stream.quality);
        setServerErr(null);

        try {
            const res = await fetch(`${API_URL}/api/download-high-quality/`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    url:       videoInfo.originalUrl,
                    format_id: stream.format_id,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || `Server error ${res.status}`);
            }

            const { token } = await res.json();

            // Browser-native download — no Blob, no JS memory buffering.
            // The browser streams the file directly from the serve-download endpoint to disk.
            const a = document.createElement('a');
            a.href  = `${API_URL}/api/serve-download/${token}/`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            setServerErr(e.message || 'Download failed. Please try again.');
        } finally {
            // Give the browser a moment to initiate the navigation before re-enabling the button.
            setTimeout(() => setServerBusy(null), 2000);
        }
    };

    const handleReset = () => {
        setVideoInfo(null);
        setErr(null);
        setServerErr(null);
        setUrl('');
    };

    // -----------------------------------------------------------------------
    // Render — URL input screen
    // -----------------------------------------------------------------------
    if (!videoInfo) {
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
                        disabled={loading}
                        required
                        style={styles.input}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            ...styles.primaryBtn,
                            background: loading ? '#9ca3af' : '#2563eb',
                            cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? 'Fetching video info…' : 'Get Download Links'}
                    </button>
                    {err && <p style={styles.error}>{err}</p>}
                    <p style={styles.hint}>Only YouTube URLs are supported.</p>
                </form>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Render — results screen
    // -----------------------------------------------------------------------
    const directStreams = videoInfo.streams.filter(s => s.type === 'direct');
    const serverStreams = videoInfo.streams.filter(s => s.type === 'server_required');

    return (
        <div style={styles.wrapper}>
            {/* Thumbnail */}
            {videoInfo.thumbnail && (
                <img src={videoInfo.thumbnail} alt={videoInfo.title} style={styles.thumbnail} />
            )}

            {/* Title + duration */}
            <div style={styles.meta}>
                <p style={styles.title}>{videoInfo.title}</p>
                {videoInfo.duration > 0 && (
                    <p style={styles.duration}>{formatDuration(videoInfo.duration)}</p>
                )}
            </div>

            {/* ── Direct downloads ────────────────────────────────────────── */}
            {directStreams.length > 0 && (
                <div style={styles.section}>
                    {directStreams.map((stream) => (
                        <a
                            key={stream.quality}
                            href={stream.url}
                            download={`${videoInfo.title}.${stream.ext}`}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.streamRow}
                        >
                            <span style={styles.qualityLabel}>{stream.quality}</span>
                            <span style={styles.streamDetail}>
                                {stream.ext.toUpperCase()}
                                {stream.filesize ? ` · ${formatSize(stream.filesize)}` : ''}
                            </span>
                            <span style={{ ...styles.badge, ...styles.badgeDirect }}>
                                Fast download
                            </span>
                            <span style={styles.arrow}>↓</span>
                        </a>
                    ))}
                </div>
            )}

            {/* ── Server-processed downloads (1080p+) ─────────────────────── */}
            {serverStreams.length > 0 && (
                <div style={styles.section}>
                    {serverStreams.map((stream) => {
                        const isThisOne = serverBusy === stream.quality;
                        const anyBusy   = serverBusy !== null;

                        return (
                            <button
                                key={stream.quality}
                                onClick={() => handleServerDownload(stream)}
                                disabled={anyBusy}
                                style={{
                                    ...styles.streamRow,
                                    ...styles.streamBtn,
                                    opacity: anyBusy && !isThisOne ? 0.5 : 1,
                                    cursor:  anyBusy ? 'not-allowed' : 'pointer',
                                    background: isThisOne ? '#eff6ff' : '#f3f4f6',
                                    borderColor: isThisOne ? '#93c5fd' : 'transparent',
                                }}
                            >
                                <span style={styles.qualityLabel}>{stream.quality}</span>
                                <span style={styles.streamDetail}>
                                    {stream.ext.toUpperCase()}
                                    {stream.filesize ? ` · ${formatSize(stream.filesize)}` : ''}
                                </span>
                                <span style={{ ...styles.badge, ...styles.badgeServer }}>
                                    HD · server
                                </span>
                                {isThisOne
                                    ? <span style={styles.spinner} />
                                    : <span style={styles.arrow}>↓</span>
                                }
                            </button>
                        );
                    })}

                    {/* Processing notice */}
                    {serverBusy && (
                        <div style={styles.processingBox}>
                            <p style={styles.processingText}>
                                Processing {serverBusy} — downloading &amp; merging on server…
                            </p>
                            <p style={styles.processingHint}>
                                This may take 1–5 minutes depending on video length. Please keep this tab open.
                            </p>
                        </div>
                    )}

                    {serverErr && <p style={styles.error}>{serverErr}</p>}
                </div>
            )}

            <button onClick={handleReset} style={styles.resetBtn}>
                ← Download another video
            </button>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
    wrapper: {
        maxWidth: 540,
        margin: '24px auto',
        display: 'grid',
        gap: 16,
    },
    form: { display: 'grid', gap: 12 },
    label: { fontWeight: 600 },
    input: {
        padding: '10px 12px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid #c9ccd1',
        boxSizing: 'border-box',
        width: '100%',
    },
    primaryBtn: {
        padding: '10px 14px',
        fontSize: 16,
        borderRadius: 8,
        border: 'none',
        color: '#fff',
        fontWeight: 600,
        transition: 'background 0.2s',
    },
    error: { color: '#b00020', margin: 0, fontSize: 14 },
    hint:  { color: '#6b7280', fontSize: 13, margin: 0 },
    thumbnail: {
        width: '100%',
        borderRadius: 8,
        objectFit: 'cover',
        maxHeight: 220,
    },
    meta:     { display: 'grid', gap: 4 },
    title:    { margin: 0, fontWeight: 700, fontSize: 16, lineHeight: 1.4 },
    duration: { margin: 0, color: '#6b7280', fontSize: 14 },
    section:  { display: 'grid', gap: 8 },

    // Shared row style (used by both <a> and <button>)
    streamRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: '#f3f4f6',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#111827',
        border: '2px solid transparent',
        transition: 'border-color 0.15s, background 0.15s',
    },
    // Extra reset for the <button> variant
    streamBtn: {
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 'inherit',
    },

    qualityLabel: { fontWeight: 700, fontSize: 15, minWidth: 46 },
    streamDetail: { color: '#6b7280', fontSize: 13, flex: 1 },
    arrow:        { fontWeight: 700, color: '#2563eb', fontSize: 18 },

    badge: {
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 99,
        whiteSpace: 'nowrap',
    },
    badgeDirect: { background: '#dcfce7', color: '#166534' },
    badgeServer: { background: '#dbeafe', color: '#1e40af' },

    spinner: {
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid #bfdbfe',
        borderTopColor: '#2563eb',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
    },

    processingBox: {
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'grid',
        gap: 4,
    },
    processingText: { margin: 0, fontWeight: 600, fontSize: 14, color: '#1e40af' },
    processingHint: { margin: 0, fontSize: 13, color: '#3b82f6' },

    resetBtn: {
        background: 'none',
        border: 'none',
        color: '#2563eb',
        cursor: 'pointer',
        fontSize: 14,
        padding: 0,
        textAlign: 'left',
    },
};
