import path from "node:path";
import { notarize } from "@electron/notarize";
import type { Configuration } from "electron-builder";

const appId = "my-own-ai-feed";
const productName = "my-own-ai-feed";
const executableName = "my-own-ai-feed";
const appxIdentityName = "my-own-ai-feed";

/**
 * @see - https://www.electron.build/configuration/configuration
 */
export default {
    appId: appId,
    asar: true,
    productName: productName,
    executableName: executableName,
    directories: {
        output: "release",
    },
    icon: "./public/app-icon.png",

    files: [
        "dist",
        "dist-electron",
        "!node_modules/node-llama-cpp/bins/**/*",
        "node_modules/node-llama-cpp/bins/${os}-${arch}*/**/*",
        "!node_modules/node-llama-cpp/llama/localBuilds/**/*",
        "node_modules/node-llama-cpp/llama/localBuilds/${os}-${arch}*/**/*",
        "!node_modules/@node-llama-cpp/*/bins/**/*",
        "node_modules/@node-llama-cpp/${os}-${arch}*/bins/**/*",
    ],
    asarUnpack: [
        "node_modules/node-llama-cpp/bins",
        "node_modules/node-llama-cpp/llama/localBuilds",
        "node_modules/@node-llama-cpp/*",
    ],
    mac: {
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: "./entitlements.mac.plist",
        entitlementsInherit: "./entitlements.mac.plist",
        target: [
            {
                target: "dmg",
                arch: ["arm64", "x64"],
            },
            {
                target: "zip",
                arch: ["arm64", "x64"],
            },
        ],

        artifactName: "${name}.macOS.${version}.${arch}.${ext}",
    },

    dmg: {
        sign: false,
    },

    afterSign: async (context) => {
        if (context.electronPlatformName !== "darwin") return;

        const appPath = path.join(
            import.meta.dirname,
            "release/mac-arm64",
            `${context.packager.appInfo.productFilename}.app`,
        );

        console.log("Notarizing", appPath);

        await notarize({
            appPath,
            keychainProfile: "WONG_LOK_PROFILE",
        }).then((r) => {
            console.log(r);
            console.log("notarize: is ok!!");
        });
    },

    win: {
        target: [
            {
                target: "nsis",
                arch: ["x64", "arm64"],
            },
        ],

        artifactName: "${name}.Windows.${version}.${arch}.${ext}",
    },
    appx: {
        identityName: appxIdentityName,
        artifactName: "${name}.Windows.${version}.${arch}.${ext}",
    },
    nsis: {
        oneClick: true,
        perMachine: false,
        allowToChangeInstallationDirectory: false,
        deleteAppDataOnUninstall: true,
    },
    linux: {
        target: [
            {
                target: "AppImage",
                arch: ["x64", "arm64"],
            },
            {
                target: "snap",
                arch: ["x64"],
            },
            {
                target: "deb",
                arch: ["x64", "arm64"],
            },
            {
                target: "tar.gz",
                arch: ["x64", "arm64"],
            },
        ],
        category: "Utility",

        artifactName: "${name}.Linux.${version}.${arch}.${ext}",
    },
} satisfies Configuration as Configuration;
