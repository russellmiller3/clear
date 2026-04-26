const key = process.env.ANTHROPIC_API_KEY;
console.log('Key present:', !!key);
if (key) console.log('Key prefix:', key.slice(0, 8));
