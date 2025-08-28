import React, { useState, useRef, useEffect } from 'react';

// Main App component
const App = () => {
  // State variables for the user script, generated assets, and UI feedback
  const [script, setScript] = useState('Welcome to the future of video creation! With this tool, you can automatically turn text into high-quality videos in seconds. Just type your story, choose a voice, and watch the AI do all the work. It will find the perfect video clips, create a voice-over, and assemble everything into a seamless production. Enjoy unlimited video creation, completely free.');
  const [timelineItems, setTimelineItems] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [progress, setProgress] = useState(0);
  const [subtitles, setSubtitles] = useState([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [videoSrc, setVideoSrc] = useState(null);
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState(null);
  const [soundEffects, setSoundEffects] = useState([]);
  const [playedEffects, setPlayedEffects] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [jszipLoaded, setJszipLoaded] = useState(false);

  // References to the video and audio elements for playback control
  const audioRef = useRef(null);
  const musicRef = useRef(null);
  const videoRef = useRef(null);

  // Gemini API key. This will be automatically provided by the Canvas environment.
  const apiKey = "";

  // Mock list of available voices from a free library
  const voiceLibrary = [
    { id: 'Kore', name: 'Kore (Firm)' },
    { id: 'Puck', name: 'Puck (Upbeat)' },
    { id: 'Zephyr', name: 'Zephyr (Bright)' },
    { id: 'Charon', name: 'Charon (Informative)' },
    { id: 'Fenrir', name: 'Fenrir (Excitable)' },
    { id: 'Leda', name: 'Leda (Youthful)' },
    { id: 'Orus', name: 'Orus (Firm)' },
    { id: 'Aoede', name: 'Aoede (Breezy)' },
  ];

  /**
   * Helper function to convert base64 audio data to a WAV Blob.
   * The Gemini TTS API returns raw PCM data, which needs a WAV header to be played.
   * @param {string} base64Data - Base64 encoded audio data.
   * @param {number} sampleRate - The sample rate of the audio (e.g., 16000).
   * @returns {Blob} A Blob object containing the WAV audio.
   */
  const pcmToWav = (base64Data, sampleRate) => {
    const audioData = atob(base64Data);
    const buffer = new ArrayBuffer(audioData.length);
    const view = new DataView(buffer);
    for (let i = 0; i < audioData.length; i++) {
      view.setUint8(i, audioData.charCodeAt(i));
    }

    const wavData = new Uint8Array(44 + buffer.byteLength);
    const dv = new DataView(wavData.buffer);

    // RIFF header
    dv.setUint32(0, 0x52494646, false); // "RIFF"
    dv.setUint32(4, 36 + buffer.byteLength, true); // Chunk size
    dv.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt sub-chunk
    dv.setUint32(12, 0x666d7420, false); // "fmt "
    dv.setUint32(16, 16, true); // Sub-chunk size
    dv.setUint16(20, 1, true); // Audio format (1 for PCM)
    dv.setUint16(22, 1, true); // Number of channels
    dv.setUint32(24, sampleRate, true); // Sample rate
    dv.setUint32(28, sampleRate * 2, true); // Byte rate
    dv.setUint16(32, 2, true); // Block align
    dv.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    dv.setUint32(36, 0x64617461, false); // "data"
    dv.setUint32(40, buffer.byteLength, true); // Sub-chunk size

    // Copy the PCM data
    for (let i = 0; i < buffer.byteLength; i++) {
      wavData[44 + i] = view.getUint8(i);
    }

    return new Blob([wavData], { type: 'audio/wav' });
  };

  /**
   * Fetches an image from the Gemini Image Generation API.
   * @param {string} prompt - The prompt for the image.
   * @returns {string} The base64 data URL of the generated image.
   */
  const generateImage = async (prompt) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
    const payload = { instances: { prompt: prompt }, parameters: { "sampleCount": 1 } };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
      } else {
        console.error("Failed to generate image:", result);
        return 'https://placehold.co/640x360/cc0000/ffffff?text=Error';
      }
    } catch (error) {
      console.error("Error generating image:", error);
      return 'https://placehold.co/640x360/cc0000/ffffff?text=Error';
    }
  };

  /**
   * Fetches a TTS audio track from the Gemini TTS API.
   * @param {string} text - The text to convert to speech.
   * @param {string} voiceName - The voice to use.
   * @returns {string} The URL of the generated WAV audio blob.
   */
  const generateAudio = async (text, voiceName) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
            }
        },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;

      if (audioData && mimeType && mimeType.startsWith("audio/")) {
        const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
        const wavBlob = pcmToWav(audioData, sampleRate);
        return URL.createObjectURL(wavBlob);
      } else {
        console.error("Failed to generate audio:", result);
        return null;
      }
    } catch (error) {
      console.error("Error generating audio:", error);
      return null;
    }
  };

  /**
   * Simulates generating background music using a Gemini text prompt.
   */
  const generateBackgroundMusic = async () => {
    const mockAudioUrl = 'https://placehold.co/1x1.mp3';
    return new Promise(resolve => setTimeout(() => resolve(mockAudioUrl), 1000));
  };

  /**
   * Simulates generating sound effects for the video.
   */
  const generateSoundEffects = async (script) => {
    const effects = [];
    if (script.includes("future")) {
      effects.push({ id: 'sfx_whoosh', name: 'Whoosh', src: 'https://placehold.co/1x1.mp3', startTime: 1 });
    }
    if (script.includes("seconds")) {
      effects.push({ id: 'sfx_click', name: 'Click', src: 'https://placehold.co/1x1.mp3', startTime: 5 });
    }
    return new Promise(resolve => setTimeout(() => resolve(effects), 1000));
  };
  
  /**
   * Orchestrates the entire automated video generation process.
   */
  const handleGenerateVideo = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setTimelineItems([]);
    setSubtitles([]);
    setVideoSrc(null);
    setProgress(0);
    setSelectedClip(null);
    setPlayedEffects([]);

    try {
      // Step 1: Generate audio
      setProgress(15);
      const audioUrl = await generateAudio(script, selectedVoice);
      if (!audioUrl) {
        throw new Error("Failed to generate audio.");
      }

      const sentences = script.split(/[.!?]\s/).filter(s => s.trim().length > 0);

      // Step 2: Generate images and wait for them to load
      setProgress(40);
      const imageAssets = [];
      const imagePromises = sentences.map(async (prompt, index) => {
        const imageUrl = await generateImage(prompt);
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const duration = 5;
            const start = sentences.slice(0, index).reduce((sum, _, i) => sum + 5, 0);
            imageAssets.push({ id: `img_${Date.now()}_${Math.random()}`, prompt: prompt, type: 'video', name: prompt.substring(0, 20) + '...', src: imageUrl, duration: duration, imgObject: img, startTime: start });
            resolve();
          };
          img.onerror = () => {
            console.error(`Failed to load image for prompt: ${prompt}`);
            resolve();
          };
          img.src = imageUrl;
        });
      });
      await Promise.all(imagePromises);

      // Sort images by their start time
      imageAssets.sort((a, b) => a.startTime - b.startTime);

      // Step 3: Generate music and sound effects (mock)
      setProgress(60);
      const musicUrl = await generateBackgroundMusic();
      const effects = await generateSoundEffects(script);

      // Step 4: Update state for timeline and preview
      setProgress(85);
      const audioItem = { id: `audio_${Date.now()}`, type: 'audio', name: 'Generated Voice-over', src: audioUrl };
      setTimelineItems([...imageAssets, audioItem]);
      setVideoSrc({ audio: audioUrl, images: imageAssets });
      setBackgroundMusicUrl(musicUrl);
      setSoundEffects(effects);

      // Create subtitle data
      let currentTime = 0;
      const subtitleData = sentences.map((text, index) => {
        const duration = (imageAssets[index] && imageAssets[index].duration) || 5;
        const subtitle = { text, startTime: currentTime, endTime: currentTime + duration };
        currentTime += duration;
        return subtitle;
      });
      setSubtitles(subtitleData);

      // Final progress update and state reset
      setProgress(100);
      setTimeout(() => {
        setIsGenerating(false);
      }, 500);

    } catch (error) {
      console.error("Video generation failed:", error);
      setIsGenerating(false);
      setProgress(0);
    }
  };

  /**
   * Handles downloading the assets as a single ZIP file.
   */
  const handleDownloadAssets = async () => {
    if (!jszipLoaded || !videoSrc || isDownloading) return;

    setIsDownloading(true);

    try {
      const zip = new window.JSZip();

      // Fetch and add audio file to zip
      const audioBlob = await fetch(videoSrc.audio).then(r => r.blob());
      zip.file("voice-over.wav", audioBlob);

      // Fetch and add image files to zip
      for (let i = 0; i < videoSrc.images.length; i++) {
        const image = videoSrc.images[i];
        const response = await fetch(image.src);
        const imageBlob = await response.blob();
        zip.file(`image_${String(i + 1).padStart(3, '0')}.png`, imageBlob);
      }

      // Generate the zip file and trigger download
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-video-assets.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate zip file:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Handles manual timing adjustments.
   */
  const handleTimingChange = (e) => {
    const newDuration = parseInt(e.target.value, 10);
    if (!isNaN(newDuration) && newDuration > 0) {
      setTimelineItems(items => items.map(item =>
        item.id === selectedClip.id ? { ...item, duration: newDuration } : item
      ));
      setSelectedClip(prev => ({ ...prev, duration: newDuration }));
    }
  };

  /**
   * Handles swapping a clip for a new one.
   */
  const handleSwapClip = async () => {
    if (!selectedClip) return;
    const originalSelectedClip = selectedClip;
    setSelectedClip(prev => ({ ...prev, isSwapping: true }));

    const newImageUrl = await generateImage(originalSelectedClip.prompt);

    setTimelineItems(items => items.map(item =>
      item.id === originalSelectedClip.id ? { ...item, src: newImageUrl } : item
    ));
    setSelectedClip(null);
  };

  /**
   * Effect hook to synchronize subtitles and images with audio playback.
   */
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !videoSrc || !videoRef.current) return;

    const canvas = videoRef.current;
    const ctx = canvas.getContext('2d');
    const handleTimeUpdate = () => {
      const currentTime = audioEl.currentTime;

      // Update Subtitles
      const activeSubtitle = subtitles.find(
        (sub) => currentTime >= sub.startTime && currentTime < sub.endTime
      );
      setCurrentSubtitle(activeSubtitle ? activeSubtitle.text : '');

      // Update Images on Canvas
      const activeImage = videoSrc.images.find(
        (image) => currentTime >= image.startTime && currentTime < image.startTime + image.duration
      );

      if (activeImage && activeImage.imgObject) {
        ctx.drawImage(activeImage.imgObject, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Play Sound Effects
      soundEffects.forEach(sfx => {
        if (currentTime >= sfx.startTime && !playedEffects.includes(sfx.id)) {
          const sfxAudio = document.getElementById(sfx.id);
          if (sfxAudio) {
            sfxAudio.play();
            setPlayedEffects(prev => [...prev, sfx.id]);
          }
        }
      });
    };

    audioEl.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      audioEl.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [subtitles, videoSrc, soundEffects, playedEffects]);
  
  // Effect hook to load JSZip library
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => {
      setJszipLoaded(true);
    };
    script.onerror = () => {
      console.error("Failed to load JSZip library. Download functionality will be disabled.");
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans p-6 rounded-xl shadow-lg flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-green-400">Jan's AI Video Studio</h1>
        <div className="flex gap-4">
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-full transition-colors duration-200 shadow-md transform hover:scale-105 disabled:bg-gray-700 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate Video 🚀'}
          </button>
          {videoSrc && (
            <button
              onClick={handleDownloadAssets}
              disabled={!jszipLoaded || isDownloading}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-full transition-colors duration-200 shadow-md transform hover:scale-105 disabled:bg-gray-700 disabled:cursor-not-allowed"
            >
              {isDownloading ? 'Zipping...' : 'Download Assets'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="col-span-1 md:col-span-1 bg-gray-800 p-6 rounded-lg shadow-inner flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-green-300">1. Video Script ✍️</h2>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="w-full h-40 bg-gray-700 text-white p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 resize-none"
            placeholder="Type your video script here..."
          />
          <div className="flex items-center gap-4">
            <span className="text-sm">Choose Voice:</span>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="flex-1 bg-gray-700 text-white p-2 rounded-full border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {voiceLibrary.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 bg-gray-800 p-6 rounded-lg shadow-inner flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-green-300">2. Video Preview & Subtitles 🎬</h2>
          <div className="w-full bg-black rounded-lg aspect-video flex items-center justify-center mb-6 relative overflow-hidden">
            {isGenerating ? (
              <div className="flex flex-col items-center w-full p-8">
                <div className="w-full bg-gray-700 rounded-full h-2.5 dark:bg-gray-700 mb-4">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="text-gray-400 text-sm text-center">AI is creating your video. Please wait...</span>
              </div>
            ) : videoSrc ? (
              <>
                <canvas ref={videoRef} width="640" height="360" className="absolute inset-0 w-full h-full object-contain"></canvas>
                <audio ref={audioRef} src={videoSrc.audio} className="w-full mt-auto" controls></audio>
                <audio ref={musicRef} src={backgroundMusicUrl} loop style={{ display: 'none' }}></audio>
                {soundEffects.map(sfx => <audio key={sfx.id} id={sfx.id} src={sfx.src} style={{ display: 'none' }}></audio>)}
                <div className="absolute bottom-16 left-0 right-0 p-4 text-center">
                  <p className="bg-black bg-opacity-70 text-white text-lg font-bold px-4 py-2 rounded-lg inline-block subtitle-animation">
                    {currentSubtitle}
                  </p>
                </div>
              </>
            ) : (
              <span className="text-gray-400 text-sm">Your video will appear here after it's generated.</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg shadow-inner">
        <h2 className="text-xl font-semibold mb-4 text-green-300">3. Video Timeline 🎞️</h2>
        {selectedClip ? (
            <div className="bg-gray-700 p-4 rounded-lg flex flex-col sm:flex-row items-center gap-4 mb-4">
              <span className="text-sm font-semibold">Editing: {selectedClip.name}</span>
              <div className="flex items-center gap-2">
                <label className="text-sm">Duration (s):</label>
                <input
                  type="number"
                  value={selectedClip.duration}
                  onChange={handleTimingChange}
                  className="w-16 bg-gray-800 text-white rounded-md p-1 text-center"
                />
              </div>
              <button
                onClick={handleSwapClip}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-full transition-colors duration-200"
              >
                Swap Clip
              </button>
              <button
                onClick={() => setSelectedClip(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-full transition-colors duration-200"
              >
                Done
              </button>
            </div>
          ) : null}
        <div className="w-full min-h-[150px] bg-gray-700 rounded-lg p-4 flex items-center overflow-x-auto gap-2 border-2 border-dashed border-gray-600 transition-colors">
          {timelineItems.length > 0 ? (
            timelineItems.map(item => (
              <div
                key={item.id}
                onClick={() => item.type === 'video' ? setSelectedClip(item) : null}
                className={`flex-shrink-0 relative rounded-lg overflow-hidden h-24 w-32 shadow-md border-2 ${selectedClip && selectedClip.id === item.id ? 'border-yellow-500' : 'border-gray-600'} transition-colors duration-200`}
                style={{ backgroundColor: item.type === 'video' ? '#22c55e' : '#ef4444' }}
              >
                {item.type === 'video' && <img src={item.src} alt={item.name} className="w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center p-2">
                  <span className="text-xs font-semibold text-center leading-tight">
                    {item.name}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 w-full text-center">
              Generated assets will appear here automatically.
            </p>
          )}
        </div>
      </div>
      <style>{`
        .subtitle-animation {
          animation: fadeInOut 2s ease-in-out infinite;
        }

        @keyframes fadeInOut {
          0%, 100% {
            opacity: 0;
            transform: translateY(10px);
          }
          20%, 80% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default App;
