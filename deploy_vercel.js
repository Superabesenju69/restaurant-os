import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

const projectDir = process.cwd();
const envFilePath = path.join(projectDir, '.env');

console.log('🚀 Starting Vercel Deployment Helper for POS App...\n');

// 1. Check if .env exists
if (!fs.existsSync(envFilePath)) {
  console.error('❌ Error: .env file not found in the current directory.');
  console.error('Please make sure you run this script from the pos-app directory containing .env.');
  process.exit(1);
}

// 2. Check if user is logged into Vercel
try {
  console.log('🔍 Checking Vercel login status...');
  const whoami = execSync('npx vercel whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  console.log(`✅ Logged in as: ${whoami}\n`);
} catch (error) {
  console.log('⚠️  You are not logged into Vercel.');
  console.log('👉 Please run "npx vercel login" first to authenticate, then run this script again.\n');
  process.exit(1);
}

// 3. Link project to Vercel (non-interactive)
console.log('🔗 Linking project to Vercel...');
const linkResult = spawnSync('npx', ['vercel', 'link', '--yes'], { stdio: 'inherit' });

if (linkResult.status !== 0) {
  console.error('❌ Failed to link project to Vercel. Exiting.');
  process.exit(1);
}
console.log('✅ Project linked successfully!\n');

// 4. Parse .env variables
console.log('📄 Parsing environment variables from .env...');
const envConfig = {};
const envContent = fs.readFileSync(envFilePath, 'utf8');
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    envConfig[key] = val;
  }
});
const keys = Object.keys(envConfig);
console.log(`Found ${keys.length} environment variables to push to Vercel.\n`);

// 5. Push environment variables to Vercel
const environments = ['production', 'preview', 'development'];

for (const key of keys) {
  const value = envConfig[key];
  if (!value) continue;

  console.log(`➡️  Adding ${key}...`);

  for (const env of environments) {
    try {
      // To prevent duplicate errors, we attempt to remove the existing env var first (non-interactive -y)
      spawnSync('npx', ['vercel', 'env', 'rm', key, env, '-y'], { stdio: 'ignore' });
      
      // Pipe the value to vercel env add
      const addProcess = spawnSync('npx', ['vercel', 'env', 'add', key, env], {
        input: value,
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'pipe']
      });

      if (addProcess.status !== 0) {
        console.warn(`   ⚠️  Failed to add to ${env}: ${addProcess.stderr?.trim() || 'Unknown error'}`);
      } else {
        console.log(`   ✅ Added to ${env}`);
      }
    } catch (e) {
      console.warn(`   ⚠️  Error setting ${key} for ${env}:`, e.message);
    }
  }
}

console.log('\n🎉 All environment variables configured!');
console.log('🚀 Deploying project to production...');

// 6. Deploy to production
const deployResult = spawnSync('npx', ['vercel', '--prod'], { stdio: 'inherit' });

if (deployResult.status !== 0) {
  console.error('\n❌ Deployment failed. Please check the logs above.');
  process.exit(1);
}

console.log('\n✨ Deployment complete! Your POS web app is now hosted online.');
