function generateShareImage() {
  const route = document.querySelector('.trip-title')?.innerText || 'Fuvar';
  const date = document.querySelector('.trip-date')?.innerText || '';
  const price = document.querySelector('.trip-price')?.innerText || '';
  const driver = document.querySelector('.driver-name')?.innerText || '';

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#020617");
  gradient.addColorStop(1, "#1e3a8a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  const logo = new Image();
  logo.src = "assets/share-logo.png";

  logo.onload = () => {
    ctx.drawImage(logo, 60, 40, 120, 120);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 46px Arial";
    ctx.fillText("FuvarVelünk.hu", 200, 100);

    ctx.font = "bold 52px Arial";
    wrapText(ctx, route, 60, 260, 1000, 60);

    ctx.font = "30px Arial";
    ctx.fillStyle = "#cbd5f5";
    ctx.fillText(date, 60, 420);

    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 36px Arial";
    ctx.fillText(price, 60, 480);

    ctx.fillStyle = "#fff";
    ctx.font = "28px Arial";
    ctx.fillText("Sofőr: " + driver, 60, 530);

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(800, 480, 320, 80);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px Arial";
    ctx.fillText("FOGLALJ MOST", 840, 530);

    const dataUrl = canvas.toDataURL();
    const link = document.createElement('a');
    link.download = "fuvar.png";
    link.href = dataUrl;
    link.click();

    const shareUrl = encodeURIComponent(window.location.href);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
    window.open(fbUrl, '_blank');
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const width = ctx.measureText(testLine).width;
    if (width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
