import { defaultConfig } from 'afterthoughts';
import deepmerge from 'deepmerge';

function defineConfig(userConfig) {
    const config = { ...defaultConfig };
    if (userConfig.site?.navigation) {
        config.site.navigation = {};
    }
    return deepmerge(config, userConfig);
}

export { defineConfig };
