<?php
// contact.php — My Financial Compass contact form (Hostinger, plain PHP, no keys in the front end).
//
// 1. Same-origin guard + POST only + honeypot + minimum fill time + per-IP rate limit.
// 2. Server-side validation of the form fields:
//    Name (First, Last) · Email · Phone (optional) · Service of interest (optional) · Message
//    (no "I am a human!" question: bots are stopped by step 1, without asking the visitor anything)
// 3. Emails the submission to the owner with PHP mail() (Hostinger supports it; Reply-To = the visitor).
// 4. Keeps a copy in a protected file: ../mfc_contact.jsonl (above public_html) or datos/ (denied by .htaccess).
//
// AJAX callers (Accept: application/json) get {ok:true|false}. Without JavaScript the browser is redirected
// back to the page (#contact) with ?sent=1 or ?sent=0.

$TO        = 'info@myfinancialcompass.org';
$PER_MIN   = 3;
$PER_DAY   = 20;
$MIN_FILL  = 3; // seconds between page load and submit

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

function finish($ok, $reason = '') {
  global $wantsJson;
  if ($wantsJson) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    if (!$ok) http_response_code($reason === 'rate' ? 429 : 400);
    echo json_encode(['ok' => $ok, 'reason' => $reason]);
    exit;
  }
  $lang = (($_POST['lang'] ?? 'en') === 'es') ? 'es/' : '';
  header('Location: ' . $lang . '?sent=' . ($ok ? '1' : '0') . '#contact', true, 303);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); finish(false, 'method'); }

// --- same origin
$host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '')); // without the port
$src  = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($src !== '') {
  $srcHost = strtolower((string) parse_url($src, PHP_URL_HOST));
  if ($srcHost === '' || $srcHost !== $host) finish(false, 'origin');
}

// --- honeypot / too fast: pretend success so bots learn nothing
if (trim((string) ($_POST['website'] ?? '')) !== '') finish(true);
$ts = (int) ($_POST['ts'] ?? 0);
if ($ts > 0 && (time() * 1000 - $ts) < $MIN_FILL * 1000) finish(true);

// --- rate limit per IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rl = sys_get_temp_dir() . '/mfc_contact_' . md5($ip) . '.json';
$now = time();
$stamps = is_file($rl) ? json_decode((string) @file_get_contents($rl), true) : [];
if (!is_array($stamps)) $stamps = [];
$stamps = array_values(array_filter($stamps, function ($t) use ($now) { return $t > $now - 86400; }));
$inMin = count(array_filter($stamps, function ($t) use ($now) { return $t > $now - 60; }));
if ($inMin >= $PER_MIN || count($stamps) >= $PER_DAY) finish(false, 'rate');

// --- validate
function field($k, $max) {
  $v = trim((string) ($_POST[$k] ?? ''));
  $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);
  return mb_substr($v, 0, $max);
}
$first   = field('first_name', 80);
$last    = field('last_name', 80);
$email   = field('email', 160);
$message = field('message', 4000);
$phone   = field('phone', 40);
$lang   = (($_POST['lang'] ?? 'en') === 'es') ? 'es' : 'en';
// the <select> sends a slug; the owner reads the English service name
$SERVICES = [
  'seminars' => 'My Financial Compass Independence Seminars & Webinars', 'retirement' => 'Retirement Planning',
  'annuities-life' => 'Annuities & Life Insurance with Living Benefits', 'business' => 'Business Planning',
  'small-business' => 'Small Business', 'career' => 'Career Planning', 'debt' => 'Debt Reduction Planning', 'needs-analysis' => 'Financial Needs Analysis', 'not-sure' => 'Not sure yet',
];
$service = $SERVICES[(string) ($_POST['service'] ?? '')] ?? '';

if ($first === '' || $last === '' || $message === '') finish(false, 'fields');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) finish(false, 'email');
$digits = strlen(preg_replace('/\D/', '', $phone));
if ($phone !== '' && (!preg_match('/^[\d\s().+-]+$/', $phone) || $digits < 7 || $digits > 15)) finish(false, 'phone');
// no header injection through the name
$first = str_replace(["\r", "\n"], ' ', $first);
$last  = str_replace(["\r", "\n"], ' ', $last);

$stamps[] = $now;
@file_put_contents($rl, json_encode(array_slice($stamps, -100)), LOCK_EX);

$row = [
  'date'       => date('c'),
  'first_name' => $first,
  'last_name'  => $last,
  'email'      => $email,
  'phone'      => $phone,
  'service'    => $service,
  'message'    => $message,
  'language'   => $lang,
  'ip'         => $ip,
];

// --- keep a copy where only the owner can read it
$stored = false;
foreach ([__DIR__ . '/..', __DIR__ . '/datos'] as $dir) {
  if (!is_dir($dir) && basename($dir) === 'datos') @mkdir($dir, 0750, true);
  if (is_dir($dir) && is_writable($dir)) {
    if (@file_put_contents($dir . '/mfc_contact.jsonl', json_encode($row, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX) !== false) { $stored = true; break; }
  }
}

// --- email the owner
$sent = false;
if (function_exists('mail')) {
  $subject = 'New message from the website — ' . $first . ' ' . $last;
  $body = "New contact form submission (myfinancialcompass.org)\n\n"
        . "Name:       {$first} {$last}\n"
        . "Email:      {$email}\n"
        . "Phone:      " . ($phone !== '' ? $phone : '—') . "\n"
        . "Service:    " . ($service !== '' ? $service : '—') . "\n"
        . "Language:   " . ($lang === 'es' ? 'Spanish' : 'English') . "\n"
        . "Date:       {$row['date']}\n\n"
        . "Message:\n{$message}\n";
  $fromHost = preg_replace('/^www\./', '', $host ?: 'myfinancialcompass.org');
  $headers  = 'From: My Financial Compass <no-reply@' . $fromHost . ">\r\n"
            . 'Reply-To: ' . $email . "\r\n"
            . "Content-Type: text/plain; charset=utf-8\r\n"
            . 'X-Mailer: PHP/' . phpversion();
  $sent = @mail($TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

finish($sent || $stored, ($sent || $stored) ? '' : 'store');
