const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: withAndroidSigning
 *
 * This plugin runs during the `npx expo prebuild` lifecycle to automate keystore
 * configuration for development and production release builds. It solves two problems:
 * 1. Copies local keystores from the git-tracked `credentials/` folder to the native `android/app/` folder.
 * 2. Modifies `android/app/build.gradle` to inject the release signing configuration.
 *
 * This ensures that builds generated on different developer machines (e.g. Windows and macOS)
 * are cryptographically signed with the exact same keys. This permits seamless app upgrades
 * on target devices without triggering signature mismatch conflicts, which would otherwise
 * force developers to uninstall the app and lose all local SQLite/AsyncStorage user data.
 */

/**
 * Copies keystore files from the project root `credentials/` directory
 * to the native Android app directory (`android/app/`).
 *
 * @param {object} config - Expo configuration object
 */
const withKeystoreFiles = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const credentialsDir = path.join(projectRoot, 'credentials');
            const androidAppDir = path.join(projectRoot, 'android', 'app');

            const filesToCopy = ['debug.keystore', '@tarx2000__the-most-dangerous-writing-app-keystore.bak.jks'];

            // Ensure the target directories exist before attempting to copy
            if (fs.existsSync(credentialsDir) && fs.existsSync(androidAppDir)) {
                for (const file of filesToCopy) {
                    const src = path.join(credentialsDir, file);
                    const dest = path.join(androidAppDir, file);

                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, dest);
                        console.log(`[withAndroidSigning] Copied '${file}' to 'android/app/'`);
                    } else {
                        console.warn(`[withAndroidSigning] Warning: Source file '${src}' not found.`);
                    }
                }
            }
            return config;
        },
    ]);
};

/**
 * Modifies android/app/build.gradle to configure the production release signing key.
 *
 * @param {object} config - Expo configuration object
 */
const withSigningGradleConfig = (config) => {
    return withAppBuildGradle(config, (config) => {
        let buildGradle = config.modResults.contents;

        // Check if the release block is already defined in signingConfigs to prevent duplicate insertions
        if (
            !buildGradle.includes('release {') ||
            !buildGradle.includes('@tarx2000__the-most-dangerous-writing-app-keystore.bak.jks')
        ) {
            // Look for the default signingConfigs block which typically contains only the debug block.
            // We will inject the release block right below the debug block.
            const signingConfigsRegex = /signingConfigs\s*\{([\s\S]*?debug\s*\{[\s\S]*?\}\s*)\}/;

            const releaseSigningConfig = `
        release {
            storeFile file('@tarx2000__the-most-dangerous-writing-app-keystore.bak.jks')
            storePassword '0bcb6a5b4d83f26a97bfaf83a131784e'
            keyAlias 'f682587560e2b508c0423b8a79377d61'
            keyPassword 'd35008572bffc0269e4d910fbac71106'
        }
      `;

            buildGradle = buildGradle.replace(signingConfigsRegex, (match, debugBlock) => {
                return `signingConfigs {\n${debugBlock}\n${releaseSigningConfig}\n    }`;
            });

            // Update the release buildType to use the release signing config instead of the default debug signing config.
            // Search for: buildTypes { ... release { ... signingConfig signingConfigs.debug ... } }
            const releaseBuildTypeRegex =
                /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.)debug/;
            if (buildGradle.match(releaseBuildTypeRegex)) {
                buildGradle = buildGradle.replace(releaseBuildTypeRegex, '$1release');
            }

            config.modResults.contents = buildGradle;
            console.log(`[withAndroidSigning] Injected release signing configuration into build.gradle`);
        }

        return config;
    });
};

/**
 * Main plugin function exported to Expo CLI.
 */
module.exports = (config) => {
    config = withKeystoreFiles(config);
    config = withSigningGradleConfig(config);
    return config;
};
