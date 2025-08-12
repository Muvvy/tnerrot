// server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();

app.use(express.static('public'));

// Поиск по всем категориям rutor.info
async function searchRutorAllCategories(query, maxResults = 50) {
  const url = 'https://rutor.info/search/0/0/000/0/' + encodeURIComponent(query);
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

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
      date,
      title,
      torrentPage,
      downloadLink,
      magnetLink,
      size,
      seeders,
      leechers,
      infoHash
    });
  });

  return results;
}

app.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
  try {
    const results = await searchRutorAllCategories(q);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// Статический фронтенд
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
