const form = document.querySelector('#form');
const urlInput = document.querySelector('#url');
const format = document.querySelector('#format');
const quality = document.querySelector('#quality');
const paste = document.querySelector('#paste');
const submit = document.querySelector('#submit');
const message = document.querySelector('#message');
const linkStatus = document.querySelector('#link-status');
const platforms = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch'];
let busy = false;
let result;

document.querySelector('#install-app').hidden = true;
document.querySelector('#install-dialog').remove();
document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    window.scrollTo(0, 0);
});
urlInput.setAttribute('aria-describedby', 'link-status');

function validLink(value) {
    try {
        const link = new URL(value);
        return link.protocol === 'https:' && !link.username && !link.password && !link.port
            && platforms.some(domain => link.hostname === domain || link.hostname.endsWith('.' + domain));
    } catch {
        return false;
    }
}

function updateForm() {
    const audio = format.value === 'mp3';
    const value = urlInput.value.trim();
    const valid = validLink(value);
    const invalid = Boolean(value) && !valid;
    urlInput.disabled = paste.disabled = format.disabled = busy;
    quality.disabled = busy || audio;
    submit.disabled = busy || !valid;
    submit.textContent = busy ? 'Descargando…' : `Descargar ${format.value.toUpperCase()} ↓`;
    document.querySelector('#format-hint').textContent = audio
        ? 'Solo audio en MP3 a 192 kbps.'
        : 'Video con audio en un archivo MP4.';
    urlInput.setAttribute('aria-invalid', String(invalid));
    linkStatus.hidden = !invalid;
    linkStatus.dataset.state = 'error';
    linkStatus.textContent = invalid ? 'Usa un enlace HTTPS de YouTube, TikTok, Instagram o Facebook.' : '';
}

urlInput.addEventListener('input', () => {
    message.textContent = '';
    updateForm();
});
format.addEventListener('change', updateForm);
paste.addEventListener('click', () => {
    const text = DressappAndroid.clipboardText().trim();
    if (text) urlInput.value = text;
    message.textContent = text ? '' : 'El portapapeles no tiene un enlace.';
    updateForm();
});

form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !validLink(urlInput.value.trim())) return;
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const progress = document.createElement('progress');
    const status = document.createElement('p');
    card.className = 'job';
    title.textContent = `Descarga ${format.value.toUpperCase()}`;
    progress.max = 100;
    progress.setAttribute('aria-label', 'Progreso de descarga');
    card.append(title, progress, status);
    document.querySelector('#results').prepend(card);
    result = { card, progress, status };
    busy = true;
    message.textContent = '';
    updateForm();
    status.textContent = 'Preparando la descarga…';
    card.scrollIntoView({ block: 'nearest' });
    DressappAndroid.download(urlInput.value.trim(), format.value, quality.value);
});

window.updateDownload = (state, text, percent) => {
    if (!result) return;
    const { card, progress, status } = result;
    status.textContent = text;
    progress.value = percent;
    if (state === 'working') return;
    card.dataset.status = state === 'done' ? 'done' : 'error';
    progress.hidden = state === 'failed';
    busy = false;
    updateForm();
};

updateForm();
