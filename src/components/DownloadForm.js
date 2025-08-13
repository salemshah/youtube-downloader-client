import React, { useState, useRef } from 'react';

// const API_URL = 'http://127.0.0.1:8000';
const API_URL = 'https://y-downloader.duckdns.org';

function getFilenameFromCD(cd) {
    if (!cd) return null;
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    try { return m && m[1] ? decodeURIComponent(m[1]) : null; }
    catch { return (m && m[1]) || null; }
}

export default function DownloadForm() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const inputRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr(null);

        const trimmed = url.trim();
        if (!trimmed) {
            setErr('Please paste a YouTube URL.');
            inputRef.current?.focus();
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/download-yt/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: trimmed }),
            });

            if (!res.ok) {
                let message = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    message = j?.error || message;
                } catch {}
                throw new Error(message);
            }

            const cd = res.headers.get('Content-Disposition');
            const suggested = getFilenameFromCD(cd) || 'video.mp4';

            const blob = await res.blob();
            const dlUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = dlUrl;
            a.download = suggested;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(dlUrl);
            setUrl('');
        } catch (e) {
            setErr(e?.message || 'Download failed');
        } finally {
            setLoading(false);
        }
    };

    return (
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
            <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Downloading…' : 'Download'}
            </button>
            {err && <p style={styles.error}>{err}</p>}
            <p style={styles.hint}>
                The file is prepared on the server, then downloaded to your browser.
            </p>
        </form>
    );
}

const styles = {
    form: { maxWidth: 520, margin: '24px auto', display: 'grid', gap: 12 },
    label: { fontWeight: 600 },
    input: { padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #c9ccd1' },
    button: { padding: '10px 14px', fontSize: 16, borderRadius: 8, border: 'none', cursor: 'pointer' },
    error: { color: '#b00020', margin: 0 },
    hint: { color: '#6b7280', fontSize: 13, margin: 0 },
};
