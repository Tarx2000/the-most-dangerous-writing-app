module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            ['babel-plugin-react-compiler', { target: '19' }],
            // Reanimated v4 requires react-native-worklets/plugin as the LAST entry.
            // It compiles worklets to run on the dedicated UI thread instead of JS.
            'react-native-worklets/plugin',
        ],
    };
};
