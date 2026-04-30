const INQUIRY_LABELS = {
  trial: '無料トライアルを始めたい',
  consultation: '導入について相談したい',
  demo: 'デモを見たい',
  contact: 'その他のお問い合わせ',
};

const escapeSlack = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.error('SLACK_WEBHOOK_URL is not configured');
    return res.status(500).json({ error: 'サーバ設定エラーです。時間をおいて再度お試しください。' });
  }

  const body = req.body || {};

  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return res.status(200).json({ ok: true });
  }

  const inquiry = (body.inquiry || '').trim();
  const company = (body.company || '').trim();
  const department = (body.department || '').trim();
  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const message = (body.message || '').trim();

  if (!inquiry || !company || !name || !email) {
    return res.status(400).json({ error: '必須項目が未入力です。' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'メールアドレスの形式が正しくありません。' });
  }
  if (company.length > 200 || name.length > 200 || email.length > 200 || message.length > 4000) {
    return res.status(400).json({ error: '入力値が長すぎます。' });
  }

  const inquiryLabel = INQUIRY_LABELS[inquiry] || inquiry;

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const fields = [
    { type: 'mrkdwn', text: `*ご相談内容*\n${escapeSlack(inquiryLabel)}` },
    { type: 'mrkdwn', text: `*会社名*\n${escapeSlack(company)}` },
  ];
  if (department) fields.push({ type: 'mrkdwn', text: `*部署*\n${escapeSlack(department)}` });
  fields.push({ type: 'mrkdwn', text: `*お名前*\n${escapeSlack(name)}` });
  fields.push({ type: 'mrkdwn', text: `*メール*\n<mailto:${email}|${escapeSlack(email)}>` });
  if (phone) fields.push({ type: 'mrkdwn', text: `*電話*\n${escapeSlack(phone)}` });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: ':inbox_tray: 新しいお問い合わせ', emoji: true },
    },
    { type: 'section', fields },
  ];

  if (message) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*メッセージ*\n${escapeSlack(truncate(message, 2800))}` },
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `:clock3: ${timestamp} JST  |  :globe_with_meridians: ${escapeSlack(ip)}` },
      { type: 'mrkdwn', text: `:computer: ${escapeSlack(truncate(ua, 200))}` },
    ],
  });

  const payload = {
    text: `新しいお問い合わせ: ${name}様（${company}）/ ${inquiryLabel}`,
    blocks,
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Slack webhook error:', response.status, text);
      return res.status(502).json({ error: '送信に失敗しました。時間をおいて再度お試しください。' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Slack webhook fetch error:', err);
    return res.status(502).json({ error: '送信に失敗しました。時間をおいて再度お試しください。' });
  }
};
