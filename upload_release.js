import fs from 'fs';
import https from 'https';
import path from 'path';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("❌ Error: GITHUB_TOKEN environment variable is not set!");
  process.exit(1);
}

const owner = "Superabesenju69";
const repo = "restaurant-os";
const tag = "v1.0.3";
const filePath = path.resolve("releases/pos-app-v1.0.3.apk");

if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: APK file not found at ${filePath}!`);
  process.exit(1);
}

async function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function main() {
  console.log(`🔍 Finding release for tag ${tag}...`);
  const getReleaseOpts = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
    method: 'GET',
    headers: {
      'User-Agent': 'NodeJS-Uploader',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  };

  const releaseRes = await request(getReleaseOpts);
  let release = releaseRes.body;

  if (releaseRes.status === 404) {
    console.log(`📝 Release not found. Creating a new release for tag ${tag}...`);
    const createReleaseOpts = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases`,
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Uploader',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    };
    const createBody = JSON.stringify({
      tag_name: tag,
      name: `${tag} - Restaurant POS`,
      body: `Restaurant POS App ${tag} (EAS Cloud Build)`,
      draft: false,
      prerelease: false
    });
    const createRes = await request(createReleaseOpts, createBody);
    if (createRes.status !== 201) {
      console.error("❌ Failed to create release:", createRes.body);
      process.exit(1);
    }
    release = createRes.body;
    console.log(`✅ Release created successfully!`);
  } else if (releaseRes.status !== 200) {
    console.error("❌ Failed to fetch release details:", releaseRes.body);
    process.exit(1);
  }

  // Remove existing assets if already uploaded to avoid name conflicts
  if (release.assets && release.assets.length > 0) {
    const existingAsset = release.assets.find(a => a.name === 'pos-app.apk');
    if (existingAsset) {
      console.log(`🗑️ Found existing pos-app.apk in release. Deleting...`);
      const deleteOpts = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`,
        method: 'DELETE',
        headers: {
          'User-Agent': 'NodeJS-Uploader',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        }
      };
      await request(deleteOpts);
      console.log(`✅ Existing asset deleted.`);
    }
  }

  const uploadUrl = release.upload_url;
  const urlTemplate = uploadUrl.split('{')[0];
  const url = new URL(`${urlTemplate}?name=pos-app.apk`);

  console.log(`📤 Uploading APK (${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB) to release assets...`);
  const stats = fs.statSync(filePath);
  const fileStream = fs.readFileSync(filePath);

  const uploadOpts = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'User-Agent': 'NodeJS-Uploader',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stats.size
    }
  };

  const uploadRes = await new Promise((resolve, reject) => {
    const req = https.request(uploadOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(fileStream);
    req.end();
  });

  if (uploadRes.status === 201) {
    console.log(`🎉 Success! APK uploaded to GitHub Releases!`);
    console.log(`🔗 Download link: ${uploadRes.body.browser_download_url}`);
  } else {
    console.error("❌ Failed to upload asset:", uploadRes.body || uploadRes.raw);
  }
}

main().catch(console.error);
