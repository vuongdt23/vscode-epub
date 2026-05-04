import { useState, useEffect, useCallback, useRef } from 'react';
import { ReactReader } from 'react-reader';
import type { NavItem, Rendition } from 'epubjs';

interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

const vscode = acquireVsCodeApi();

type Theme = 'light' | 'dark' | 'sepia';
type Panel = 'toc' | 'bookmarks' | null;

interface Bookmark {
  location: string;
  label: string;
  chapter: string;
  timestamp: number;
}

const THEME_CONFIG = {
  light: {
    fg: '#3c3c3c',
    bg: '#ffffff',
    surface: '#f8f8f8',
    surfaceAlt: '#ffffff',
    border: 'rgba(0, 0, 0, 0.08)',
    muted: '#999999',
    accent: '#1a73e8',
    tocBg: '#ffffff',
    tocHover: '#f0f4ff',
    tocActive: '#e8f0fe',
    readerBg: '#ffffff',
  },
  dark: {
    fg: '#e0e0e0',
    bg: '#121212',
    surface: '#1e1e1e',
    surfaceAlt: '#252525',
    border: 'rgba(255, 255, 255, 0.08)',
    muted: '#777777',
    accent: '#8ab4f8',
    tocBg: '#1e1e1e',
    tocHover: '#2a2d35',
    tocActive: '#2d3748',
    readerBg: '#1e1e1e',
  },
  sepia: {
    fg: '#3b2e20',
    bg: '#faf4e8',
    surface: '#f5edd8',
    surfaceAlt: '#faf4e8',
    border: 'rgba(67, 52, 34, 0.12)',
    muted: '#8c7a65',
    accent: '#a0522d',
    tocBg: '#faf4e8',
    tocHover: '#f0e8d4',
    tocActive: '#ede0c8',
    readerBg: '#faf4e8',
  },
};

function App() {
  const [bookUrl, setBookUrl] = useState<ArrayBuffer | null>(null);
  const [location, setLocation] = useState<string | number>(0);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState(100);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [progress, setProgress] = useState(0);
  const [locationsReady, setLocationsReady] = useState(false);
  const [isSpread, setIsSpread] = useState(true);
  const renditionRef = useRef<Rendition | null>(null);
  const readerAreaRef = useRef<HTMLDivElement | null>(null);

  // Spread only when the container occupies at least 50% of the screen width
  const SPREAD_SCREEN_RATIO = 0.5;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (!message.type) return; // Ignore internal browser/epub.js noise
      console.log('[EPUB] Message received:', message.type);
      switch (message.type) {
        case 'loadBook': {
          console.log('[EPUB] loadBook — data length:', message.data.length, 'saved location:', message.location || '(none)');
          const arrayBuffer = new Uint8Array(message.data).buffer;
          setBookUrl(arrayBuffer);
          if (message.location) {
            console.log('[EPUB] Restoring saved location:', message.location.slice(0, 60));
            setLocation(message.location);
          }
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    console.log('[EPUB] Webview mounted, sending ready signal');
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // Responsive spread: observe container width
  useEffect(() => {
    const el = readerAreaRef.current;
    if (!el) return;

    const shouldUseSpread = (width: number) =>
      width >= window.screen.width * SPREAD_SCREEN_RATIO;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const spread = shouldUseSpread(width);
        console.log(`[EPUB] Resize: ${Math.round(width)}px, screen: ${window.screen.width}px, spread: ${spread}`);
        setIsSpread(spread);
        if (renditionRef.current) {
          renditionRef.current.spread(spread ? 'auto' : 'none');
        }
      }
    });

    observer.observe(el);
    setIsSpread(shouldUseSpread(el.clientWidth));
    return () => observer.disconnect();
  }, [bookUrl]);

  const updateProgress = useCallback((loc: string) => {
    if (!renditionRef.current) return;
    // Only process valid CFI strings — skip raw hrefs from TOC navigation
    if (!loc || !loc.startsWith('epubcfi(')) return;
    try {
      const book = renditionRef.current.book;
      const pct = book.locations.percentageFromCfi(loc);
      setProgress((pct || 0) * 100);
      const locIndex = book.locations.locationFromCfi(loc);
      const total = book.locations.length();
      setCurrentPage((locIndex || 0) + 1);
      setTotalPages(total);
    } catch (err) {
      console.warn('[EPUB] updateProgress failed:', loc?.slice(0, 50), err);
    }
  }, []);

  // Recalculate progress when locations become ready
  useEffect(() => {
    if (locationsReady && typeof location === 'string' && location) {
      updateProgress(location);
    }
  }, [locationsReady, location, updateProgress]);

  const onLocationChanged = useCallback((newLocation: string) => {
    try {
      setLocation(newLocation);
      vscode.postMessage({ type: 'locationChanged', location: newLocation });

      if (renditionRef.current && locationsReady) {
        updateProgress(newLocation);
      }
    } catch (err) {
      console.error('[EPUB] onLocationChanged error:', err);
    }
  }, [locationsReady, updateProgress]);

  const onTocChanged = useCallback((newToc: NavItem[]) => {
    setToc(newToc);
  }, []);

  const findCurrentChapter = useCallback(
    (loc: string) => {
      if (!toc.length) return;
      // Simple approach: find the last TOC item whose href matches
      const book = renditionRef.current?.book;
      if (!book) return;
      const found = toc.find((item) => {
        return loc.includes(item.href);
      });
      if (found) {
        setCurrentChapter(found.label.trim());
      }
    },
    [toc]
  );

  useEffect(() => {
    if (typeof location === 'string') {
      findCurrentChapter(location);
    }
  }, [location, findCurrentChapter]);

  const removeBookmark = useCallback((index: number) => {
    setBookmarks((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      vscode.postMessage({ type: 'updateBookmarks', bookmarks: updated });
      return updated;
    });
  }, []);

  const addBookmark = useCallback(() => {
    if (typeof location === 'string') {
      // Prevent duplicate bookmarks at the same location
      const alreadyExists = bookmarks.some((bm) => bm.location === location);
      if (alreadyExists) return;

      const bookmark: Bookmark = {
        location,
        label: `Page ${currentPage}`,
        chapter: currentChapter || 'Unknown chapter',
        timestamp: Date.now(),
      };
      setBookmarks((prev) => {
        const updated = [...prev, bookmark];
        vscode.postMessage({ type: 'updateBookmarks', bookmarks: updated });
        return updated;
      });
    }
  }, [location, currentPage, currentChapter, bookmarks]);

  const applyTheme = useCallback(
    (rendition: Rendition) => {
      const config = THEME_CONFIG[theme];
      rendition.themes.override('color', config.fg);
      rendition.themes.override('background', config.readerBg);
      rendition.themes.override('font-size', `${fontSize}%`);
    },
    [theme, fontSize]
  );

  useEffect(() => {
    if (renditionRef.current) {
      applyTheme(renditionRef.current);
    }
  }, [theme, fontSize, applyTheme]);

  const goToTocItem = (href: string) => {
    setLocation(href);
    setOpenPanel(null);
  };

  const togglePanel = (panel: Panel) => {
    setOpenPanel((prev) => (prev === panel ? null : panel));
  };

  const themeVars = THEME_CONFIG[theme];
  const cssVars = {
    '--c-fg': themeVars.fg,
    '--c-bg': themeVars.bg,
    '--c-surface': themeVars.surface,
    '--c-surface-alt': themeVars.surfaceAlt,
    '--c-border': themeVars.border,
    '--c-muted': themeVars.muted,
    '--c-accent': themeVars.accent,
    '--c-toc-bg': themeVars.tocBg,
    '--c-toc-hover': themeVars.tocHover,
    '--c-toc-active': themeVars.tocActive,
    '--c-reader-bg': themeVars.readerBg,
  } as React.CSSProperties;

  if (!bookUrl) {
    return (
      <div className="loading" style={cssVars}>
        <div className="loading-spinner" />
        <p>Loading book...</p>
      </div>
    );
  }

  return (
    <div className="app" style={cssVars}>
      {/* ─── Top Header ─── */}
      <header className="header">
        <div className="header-left">
          <button className="icon-btn" onClick={() => togglePanel('toc')} aria-label="Table of contents">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span className="header-title">{currentChapter || 'EPUB Reader'}</span>
        </div>
        <div className="header-right">
          {/* Theme selector */}
          <div className="theme-pills">
            {(['light', 'dark', 'sepia'] as Theme[]).map((t) => (
              <button
                key={t}
                className={`theme-pill ${theme === t ? 'active' : ''}`}
                onClick={() => setTheme(t)}
                aria-label={`${t} theme`}
              >
                <span className={`pill-dot pill-dot--${t}`} />
              </button>
            ))}
          </div>

          {/* Font size */}
          <div className="font-controls">
            <button className="icon-btn" onClick={() => setFontSize((s) => Math.max(60, s - 10))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
              </svg>
            </button>
            <span className="font-value">{fontSize}%</span>
            <button className="icon-btn" onClick={() => setFontSize((s) => Math.min(200, s + 10))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {/* Bookmark */}
          <button className="icon-btn" onClick={addBookmark} aria-label="Bookmark this page">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className={`icon-btn ${openPanel === 'bookmarks' ? 'active' : ''}`}
            onClick={() => togglePanel('bookmarks')}
            aria-label="View bookmarks"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 12h10M4 18h14" />
            </svg>
          </button>
        </div>
      </header>

      <div className="main-area">
        {/* ─── Side Panel (TOC / Bookmarks) ─── */}
        {openPanel && (
          <>
            <div className="panel-backdrop" onClick={() => setOpenPanel(null)} />
            <aside className="side-panel">
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${openPanel === 'toc' ? 'active' : ''}`}
                  onClick={() => setOpenPanel('toc')}
                >
                  Contents
                </button>
                <button
                  className={`panel-tab ${openPanel === 'bookmarks' ? 'active' : ''}`}
                  onClick={() => setOpenPanel('bookmarks')}
                >
                  Bookmarks
                </button>
                <button className="panel-close" onClick={() => setOpenPanel(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="panel-content">
                {openPanel === 'toc' && (
                  <ul className="toc-list">
                    {toc.map((item, i) => (
                      <li key={i}>
                        <button
                          className={`toc-item ${currentChapter === item.label.trim() ? 'active' : ''}`}
                          onClick={() => goToTocItem(item.href)}
                        >
                          <span className="toc-label">{item.label.trim()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {openPanel === 'bookmarks' && (
                  <>
                    {bookmarks.length === 0 ? (
                      <div className="panel-empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        <p>No bookmarks yet</p>
                        <span>Tap the bookmark icon to save your place</span>
                      </div>
                    ) : (
                      <ul className="bookmarks-list">
                        {bookmarks.map((bm, i) => (
                          <li key={i} className="bookmark-row">
                            <button className="bookmark-item" onClick={() => { setLocation(bm.location); setOpenPanel(null); }}>
                              <div className="bookmark-info">
                                <span className="bookmark-chapter">{bm.chapter}</span>
                                <span className="bookmark-meta">{bm.label} &middot; {new Date(bm.timestamp).toLocaleDateString()}</span>
                              </div>
                            </button>
                            <button
                              className="bookmark-delete"
                              onClick={(e) => { e.stopPropagation(); removeBookmark(i); }}
                              aria-label="Delete bookmark"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </aside>
          </>
        )}

        {/* ─── Reader Content ─── */}
        <div className="reader-area" ref={readerAreaRef}>
          <ReactReader
            url={bookUrl}
            location={location}
            locationChanged={onLocationChanged}
            tocChanged={onTocChanged}
            showToc={false}
            getRendition={(rendition) => {
              console.log('[EPUB] getRendition called');
              renditionRef.current = rendition;
              applyTheme(rendition);
              rendition.themes.override('line-height', '1.6');

              // Inject CSS to constrain wide content (tables, images)
              rendition.themes.register('custom', {});
              rendition.hooks.content.register((contents: any) => {
                console.log('[EPUB] Content hook fired — injecting constraint CSS');
                const doc = contents.document;
                const style = doc.createElement('style');
                style.textContent = `
                  table {
                    max-width: 100% !important;
                    width: auto !important;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                    font-size: 0.9em;
                  }
                  table td, table th {
                    padding: 4px 6px;
                    word-break: break-word;
                  }
                  img, svg {
                    max-width: 100% !important;
                    height: auto !important;
                    object-fit: contain;
                  }
                  pre, code {
                    white-space: pre-wrap !important;
                    word-wrap: break-word !important;
                    max-width: 100% !important;
                    overflow-x: hidden !important;
                  }
                  body {
                    overflow-x: hidden !important;
                  }
                `;
                doc.head.appendChild(style);
              });

              // Generate locations for absolute progress tracking
              console.log('[EPUB] Generating book locations...');
              rendition.book.ready.then(() => {
                console.log('[EPUB] Book ready, generating locations (this may take a moment)');
                return rendition.book.locations.generate(1024);
              }).then(() => {
                const total = rendition.book.locations.length();
                console.log(`[EPUB] Locations generated: ${total} total locations`);
                setLocationsReady(true);
                setTotalPages(total);
              }).catch((err: any) => {
                console.error('[EPUB] Error generating locations:', err);
              });

              // Log rendition errors
              rendition.on('displayError', (err: any) => {
                console.error('[EPUB] Display error:', err);
              });

              // Set initial spread based on current width
              const el = readerAreaRef.current;
              if (el) {
                const spread = el.clientWidth >= window.screen.width * SPREAD_SCREEN_RATIO;
                console.log(`[EPUB] Initial spread: ${spread} (container: ${el.clientWidth}px, screen: ${window.screen.width}px)`);
                rendition.spread(spread ? 'auto' : 'none');
              }
            }}
            readerStyles={getReaderStyles(themeVars)}
          />
          {/* Center page divider — only visible in spread mode */}
          {isSpread && <div className="page-divider" />}
        </div>
      </div>

      {/* ─── Bottom Bar ─── */}
      <footer className="bottom-bar">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <input
            type="range"
            className="progress-slider"
            min="0"
            max="100"
            value={progress}
            onChange={(e) => {
              const pct = Number(e.target.value) / 100;
              if (renditionRef.current) {
                const book = renditionRef.current.book;
                const cfi = book.locations.cfiFromPercentage(pct);
                setLocation(cfi);
              }
            }}
          />
        </div>
        <div className="page-info">
          <span>{totalPages > 0 ? `${currentPage} of ${totalPages}` : <span className="loading-spinner-sm" />}</span>
          <span className="progress-pct">{Math.round(progress)}%</span>
        </div>
      </footer>
    </div>
  );
}

function getReaderStyles(themeVars: typeof THEME_CONFIG.light) {
  return {
    container: {
      overflow: 'hidden',
      position: 'relative' as const,
      height: '100%',
    },
    readerArea: {
      position: 'relative' as const,
      zIndex: 1,
      height: '100%',
      width: '100%',
      backgroundColor: themeVars.readerBg,
      transition: 'all 0.3s ease',
    },
    containerExpanded: {
      transform: 'translateX(0)',
    },
    titleArea: {
      display: 'none' as const,
    },
    reader: {
      position: 'absolute' as const,
      top: 16,
      left: 50,
      bottom: 16,
      right: 50,
    },
    swipeWrapper: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      zIndex: 200,
    },
    prev: {
      position: 'absolute' as const,
      top: '50%',
      left: 8,
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: themeVars.muted,
      cursor: 'pointer',
      fontSize: '24px',
      padding: '8px',
      opacity: '0.5',
      transition: 'opacity 0.2s',
      zIndex: 1,
    },
    next: {
      position: 'absolute' as const,
      top: '50%',
      right: 8,
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: themeVars.muted,
      cursor: 'pointer',
      fontSize: '24px',
      padding: '8px',
      opacity: '0.5',
      transition: 'opacity 0.2s',
      zIndex: 1,
    },
    arrow: {
      fontSize: '24px',
    },
    tocArea: {
      display: 'none' as const,
    },
    tocButton: {
      display: 'none' as const,
    },
    tocButtonExpanded: {
      display: 'none' as const,
    },
    tocButtonBar: {
      display: 'none' as const,
    },
    loadingView: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: themeVars.muted,
      fontSize: '13px',
    },
  };
}

export default App;
