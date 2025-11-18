// Anthropic Models Manager - Demo Page
// Simple demo showing current Claude model with liquid fill animation

class ModelDemo {
  constructor() {
    this.button = document.getElementById('getModelBtn');
    this.result = document.getElementById('result');
    this.modelName = document.getElementById('modelName');
    this.modelTimestamp = document.getElementById('modelTimestamp');

    this.init();
  }

  init() {
    this.button.addEventListener('click', () => this.fetchModel());
  }

  async fetchModel() {
    // Disable button
    this.button.disabled = true;
    this.button.classList.add('loading');

    // Change text
    const textSpan = this.button.querySelector('.btn-text');
    textSpan.textContent = 'Fetching...';

    // Add liquid wave animation
    const wave = this.createWaveSVG();
    const bubbles = this.createBubbleSVG();
    this.button.appendChild(wave);
    this.button.appendChild(bubbles);

    try {
      // Fetch current model from bot-protected API
      const response = await fetch('/api/demo/current-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch model');
      }

      const data = await response.json();

      // Wait for animation to complete (3 seconds)
      setTimeout(() => {
        this.displayResult(data);
      }, 3000);

    } catch (error) {
      console.error('Error fetching model:', error);
      textSpan.textContent = 'Error - Try Again';
      this.button.disabled = false;
      this.button.classList.remove('loading');

      // Remove animations
      const wave = this.button.querySelector('.liquid-wave');
      const bubbles = this.button.querySelector('.bubble-mask-container');
      if (wave) wave.remove();
      if (bubbles) bubbles.remove();
    }
  }

  createWaveSVG() {
    const wave = document.createElement('div');
    wave.className = 'liquid-wave';
    wave.innerHTML = `
      <svg viewBox="0 0 1200 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(139, 92, 246, 0.6);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(159, 122, 234, 0.8);stop-opacity:1" />
          </linearGradient>
        </defs>
        <path fill="url(#waveGradient)" d="M0,50 C150,60 250,40 400,50 C550,60 650,40 800,50 C950,60 1050,40 1200,50 L1200,100 L0,100 Z">
          <animate attributeName="d" dur="2s" repeatCount="indefinite"
            values="M0,50 C150,60 250,40 400,50 C550,60 650,40 800,50 C950,60 1050,40 1200,50 L1200,100 L0,100 Z;
                    M0,50 C150,40 250,60 400,50 C550,40 650,60 800,50 C950,40 1050,60 1200,50 L1200,100 L0,100 Z;
                    M0,50 C150,60 250,40 400,50 C550,60 650,40 800,50 C950,60 1050,40 1200,50 L1200,100 L0,100 Z"/>
        </path>
      </svg>
    `;
    return wave;
  }

  createBubbleSVG() {
    const maskContainer = document.createElement('div');
    maskContainer.className = 'bubble-mask-container';
    maskContainer.innerHTML = `
      <svg class="bubble-stream" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="4" fill="rgba(255,255,255,0.6)" />
        <circle cx="120" cy="80" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="200" cy="60" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="280" cy="90" r="4" fill="rgba(255,255,255,0.6)" />
        <circle cx="350" cy="70" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="420" cy="50" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="80" cy="140" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="150" cy="160" r="4" fill="rgba(255,255,255,0.6)" />
        <circle cx="230" cy="150" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="300" cy="170" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="380" cy="140" r="4" fill="rgba(255,255,255,0.6)" />
        <circle cx="450" cy="160" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="60" cy="220" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="140" cy="240" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="210" cy="230" r="4" fill="rgba(255,255,255,0.6)" />
        <circle cx="290" cy="250" r="5" fill="rgba(255,255,255,0.6)" />
        <circle cx="360" cy="220" r="3" fill="rgba(255,255,255,0.6)" />
        <circle cx="440" cy="240" r="4" fill="rgba(255,255,255,0.6)" />
      </svg>
    `;
    return maskContainer;
  }

  displayResult(data) {
    // Mark animations as completed
    const wave = this.button.querySelector('.liquid-wave');
    const bubbles = this.button.querySelector('.bubble-mask-container');
    if (wave) wave.classList.add('completed');
    if (bubbles) bubbles.classList.add('completed');

    // Update button state
    this.button.classList.remove('loading');
    this.button.classList.add('revealed');

    // Hide button text
    const textSpan = this.button.querySelector('.btn-text');
    textSpan.style.opacity = '0';

    // Show result
    this.modelName.textContent = data.model;
    this.modelTimestamp.textContent = `Retrieved: ${new Date(data.timestamp).toLocaleString()}`;
    this.result.style.display = 'block';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ModelDemo();
});
