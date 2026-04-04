/**
 * hooks/useVoice.js
 *
 * React hook that wires the Web Speech API into component state.
 *
 *   TTS (text-to-speech) — delegates all text preparation, voice selection,
 *     and mobile fixes to utils/speech.js via speakMessage().
 *
 *   STT (speech-to-text) — SpeechRecognition / webkitSpeechRecognition.
 *     A FRESH instance is created for every recording session.  Reusing a
 *     finished instance throws InvalidStateError on Chrome Android and Safari.
 *
 * PRIVACY: no audio data is ever sent to our backend or any external service.
 * All processing is client-side (browser-native APIs only).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { speakMessage } from '../utils/speech';

const LANG = 'es-MX';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const synthAPI = typeof window !== 'undefined' ? window.speechSynthesis : null;

const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [voiceError,  setVoiceError]  = useState(null);

  const recRef    = useRef(null);  // current STT instance (recreated per session)
  const resumeRef = useRef(null);  // Chrome Android TTS keepalive interval

  const sttSupported = Boolean(SpeechRecognitionAPI);
  const ttsSupported = Boolean(synthAPI);

  // ── Cancel TTS on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(resumeRef.current);
      if (synthAPI) synthAPI.cancel();
    };
  }, []);

  // ── TTS speak — delegates to utils/speech.js ─────────────────────────────
  const speak = useCallback((text) => {
    speakMessage(text, {
      onStart: () => setIsSpeaking(true),
      onEnd:   () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      resumeRef,
    });
  }, []);

  // ── TTS cancel ───────────────────────────────────────────────────────────
  const cancelSpeak = useCallback(() => {
    if (!synthAPI) return;
    clearInterval(resumeRef.current);
    synthAPI.cancel();
    setIsSpeaking(false);
  }, []);

  // ── STT startListening ───────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI || isListening) return;

    setTranscript('');
    setVoiceError(null);
    setIsListening(true);

    const rec = new SpeechRecognitionAPI();
    rec.lang            = LANG;
    rec.continuous      = false;
    rec.interimResults  = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      if (text) setTranscript(text);
    };

    rec.onerror = (event) => {
      if (!['no-speech', 'aborted'].includes(event.error)) {
        setVoiceError(event.error);
      }
      setIsListening(false);
    };

    rec.onend = () => setIsListening(false);

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setIsListening(false);
    }
  }, [isListening]);

  // ── STT stopListening ────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (!recRef.current || !isListening) return;
    try { recRef.current.stop(); } catch { /* already ended */ }
  }, [isListening]);

  const clearTranscript = useCallback(() => setTranscript(''), []);

  return {
    // State
    isListening,
    isSpeaking,
    transcript,
    voiceError,
    // Capabilities
    sttSupported,
    ttsSupported,
    // STT actions
    startListening,
    stopListening,
    clearTranscript,
    // TTS actions
    speak,
    cancelSpeak,
  };
};

export default useVoice;
