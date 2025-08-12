const express = require('express');
const WebTorrent = require('webtorrent');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const client = new WebTorrent();

app.use(express.static('public'));

// --- Поиск на rutor.info ---
async function searchRutor(query, maxResults = 20) {
  const url = 'https://rutor.info/search/0/5/000/0/' + encodeURIComponent(query);
  const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(data);
  const rows = $('tr.gai, tr.tum');
  const results = [];
  rows.each((i, el) => {
    if (i >= maxResults) return false;
    const cols = $(el).find('td');
    if (cols.length < 5) return;
    const date = $(cols[0]).text().trim();
    const downloadLink = $(cols[1]).find('a.downgif').attr('href');
    const magnetLink = $(cols[1]).find('a[href^="magnet:"]').attr('href');
    const titleTag = $(cols[1]).find('a').last();
    const title = titleTag.text().trim();
    const torrentPage = 'https://rutor.info' + titleTag.attr('href');
    const size = $(cols[2]).text().trim();
    const seeders = $(cols[4]).find('span.green').text().trim() || '0';
    const leechers = $(cols[4]).find('span.red').text().trim() || '0';
    let infoHash = '';
    if (magnetLink) {
      const match = magnetLink.match(/btih:([a-f0-9A-F]{40})/);
      if (match) infoHash = match[1].toLowerCase();
    }
    results.push({
      date, title, torrentPage, downloadLink, magnetLink, size, seeders, leechers, infoHash
    });
  });
  return results;
}

// Главная страница поиска
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Страница фильма (детали раздачи)
app.get("/movie/:infoHash", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "movie.html"));
});

// Поиск
app.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
  try {
    const results = await searchRutor(q);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// Инфо о раздаче для страницы фильма
app.get('/torrent/:infoHash', async (req, res) => {
  const infoHash = req.params.infoHash.toLowerCase();
  if (!infoHash) return res.status(400).json({ error: "No infoHash" });
  // Render не хранит кэш, ищем по заголовку как поиском
  // (Лучше — кэшировать последние запросы в RAM или базе)
  try {
    // Ищем по названию (можно прокидывать query)
    const results = await searchRutor('');
    const torrent = results.find(t => t.infoHash === infoHash);
    if (!torrent) return res.status(404).json({ error: 'Torrent not found' });
    res.json(torrent);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// Стриминг по infoHash
app.get('/stream/:infoHash', async (req, res) => {
  const infoHash = req.params.infoHash.toLowerCase();
  if (!infoHash) return res.status(400).send('No infoHash');
  const range = req.headers.range;
  if (!range) return res.status(400).send('Requires Range header');
  try {
    // Находим magnet-ссылку по infoHash (в реальном проекте — кэшируй)
    const results = await searchRutor('');
    const torrent = results.find(t => t.infoHash === infoHash);
    if (!torrent) return res.status(404).send('Torrent not found');
    const magnet = torrent.magnetLink;

    let t = client.get(magnet);
    if (!t) t = client.add(magnet);

    t.on('ready', () => {
      const file = t.files.find(f => /\.(mp4|mkv|avi|webm)$/i.test(f.name));
      if (!file) return res.status(404).send('No video file found');
      const total = file.length;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (start >= total || end >= total) return res.status(416).send('Range Not Satisfiable');
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
    });
  } catch (e) {
    res.status(500).send(e.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
