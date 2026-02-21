'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useResolver } from './ResolverContext';
import { DEFAULT_CONFIG } from '@/lib/types';

export default function ConfigPage() {
  const router = useRouter();
  const {
    config, loadFeed, recomputeWithConfig, invalidateFeed, setConfig,
    isReady, contestData, reset, currentStep, hasFrozenPeriod,
  } = useResolver();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(isReady);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [revealDuration, setRevealDuration] = useState(String(config.revealDuration));
  const [movementSpeed, setMovementSpeed] = useState(String(config.movementSpeed));
  const [autoplayPause, setAutoplayPause] = useState(String(config.autoplayPause));
  const [startTime, setStartTime] = useState(config.startTime || '');
  const [pauseAtRanks, setPauseAtRanks] = useState(config.pauseAtRanks.join(', '));

  // Whether there's a previous resolver session to resume
  const canResume = isReady && currentStep > -1;

  const buildConfig = useCallback(() => ({
    revealDuration: parseInt(revealDuration) || DEFAULT_CONFIG.revealDuration,
    movementSpeed: parseInt(movementSpeed) || DEFAULT_CONFIG.movementSpeed,
    autoplayPause: parseInt(autoplayPause) || DEFAULT_CONFIG.autoplayPause,
    startTime: startTime.trim() || null,
    pauseAtRanks: pauseAtRanks
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n)),
  }), [revealDuration, movementSpeed, autoplayPause, startTime, pauseAtRanks]);

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setError(null);
    setLoading(true);
    setFeedLoaded(false);

    try {
      const text = await file.text();
      const newConfig = buildConfig();
      try {
        loadFeed(text, newConfig);
        setFeedLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse feed');
        setFeedLoaded(false);
        invalidateFeed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
      setFeedLoaded(false);
      invalidateFeed();
    } finally {
      setLoading(false);
    }
  }, [buildConfig, loadFeed, invalidateFeed]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }, [processFile]);

  const handleStart = () => {
    const newConfig = buildConfig();
    // Only recompute if startTime changed (it affects the resolver steps).
    // Otherwise just update animation settings and preserve currentStep.
    const startTimeChanged = (newConfig.startTime ?? '') !== (config.startTime ?? '');
    if (startTimeChanged) {
      recomputeWithConfig(newConfig);
    } else {
      // Just update animation/pause settings without recomputing
      setConfig(newConfig);
    }
    router.push('/scoreboard');
  };

  const handleReset = () => {
    reset();
    setFeedLoaded(false);
    setFileName(null);
    setError(null);
    setRevealDuration(String(DEFAULT_CONFIG.revealDuration));
    setMovementSpeed(String(DEFAULT_CONFIG.movementSpeed));
    setAutoplayPause(String(DEFAULT_CONFIG.autoplayPause));
    setStartTime('');
    setPauseAtRanks(DEFAULT_CONFIG.pauseAtRanks.join(', '));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="config-page">
      <div className="config-container">
        <div className="config-header">
          <h1>ICPC Scoreboard Resolver</h1>
          <p className="config-subtitle">Configure and launch the animated scoreboard resolver</p>
        </div>

        {/* Contest Data Section */}
        <section className="config-section">
          <h2>
            Event Feed
          </h2>
          <div
            className={`file-upload-area${isDragOver ? ' drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.ndjson,.txt"
              onChange={handleFileChange}
              id="feed-file"
              className="file-input"
            />
            <label htmlFor="feed-file" className="file-label">
              {fileName ? (
                <span>{fileName}</span>
              ) : (
                <span>Choose or drop event feed file</span>
              )}
            </label>
          </div>
          {error && <div className="error-message">{error}</div>}
          {loading && <div className="loading-message">Parsing contest data...</div>}
          {feedLoaded && contestData && (
            <div className="feed-summary">
              <span className="summary-badge">✓ Loaded</span>
              <span>{contestData.contest.name || contestData.contest.formal_name}</span>
              <span className="summary-detail">
                {contestData.teams.length} teams · {contestData.problems.length} problems
              </span>
            </div>
          )}
          {feedLoaded && contestData && !hasFrozenPeriod && (
            <div className="warning-message">
              ⚠ This contest feed has no frozen scoreboard period.
              Set a custom start time below to define which submissions to reveal.
            </div>
          )}
        </section>

        {/* Animation Settings */}
        <section className="config-section">
          <h2>
            Animation Settings
          </h2>
          <div className="settings-grid">
            <div className="setting-field">
              <label htmlFor="reveal-duration">Reveal Duration (ms)</label>
              <input
                id="reveal-duration"
                type="number"
                min="100"
                max="5000"
                step="50"
                value={revealDuration}
                onChange={(e) => setRevealDuration(e.target.value)}
              />
            </div>
            <div className="setting-field">
              <label htmlFor="movement-speed">Movement Speed (ms)</label>
              <input
                id="movement-speed"
                type="number"
                min="100"
                max="5000"
                step="50"
                value={movementSpeed}
                onChange={(e) => setMovementSpeed(e.target.value)}
              />
            </div>
            <div className="setting-field">
              <label htmlFor="autoplay-pause">Autoplay Pause (ms)</label>
              <input
                id="autoplay-pause"
                type="number"
                min="0"
                max="5000"
                step="50"
                value={autoplayPause}
                onChange={(e) => setAutoplayPause(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Breakpoint Settings */}
        <section className="config-section">
          <h2>
            Breakpoint Settings
          </h2>
          <div className="settings-grid">
            <div className="setting-field">
              <label htmlFor="start-time">Start Time (h:mm:ss)</label>
              <input
                id="start-time"
                type="text"
                placeholder="Leave blank for freeze time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="setting-field">
              <label htmlFor="pause-ranks">Pause at Ranks</label>
              <input
                id="pause-ranks"
                type="text"
                placeholder="1, 2, 3"
                value={pauseAtRanks}
                onChange={(e) => setPauseAtRanks(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="config-actions">
          <button
            className="btn-start"
            onClick={handleStart}
            disabled={!isReady}
          >
            {canResume ? 'Resume Resolver' : 'Start Resolver'}
          </button>
          {isReady && (
            <button className="btn-reset" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>
      </div >
    </div >
  );
}
