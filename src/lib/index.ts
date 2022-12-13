import { defaultConfig } from "afterthoughts";
import deepmerge from "deepmerge";
import type { AftUserConfig, AftConfig } from "afterthoughts";

export function defineConfig(userConfig: AftUserConfig) {
    const config = {...defaultConfig};
    
    if (userConfig.site?.navigation) {
        config.site.navigation = {};
    }
    
    return deepmerge(config, userConfig) as AftConfig;
}
