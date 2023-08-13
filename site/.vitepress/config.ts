
import path from 'path'

import {defineConfig} from 'vitepress'


export default defineConfig({
    outDir: 'dist',
    srcDir: 'src',
    title: "fetch(bible)",
    description: "Unrestricted digital access to thousands of Bible translations.",
    head: [
        ['link', {rel: 'icon', href: '/icon.png'}],
        ['meta', {property: 'og:image', content: '/social.png'}],
        ['meta', {property: 'og:image:width', content: '1200'}],
        ['meta', {property: 'og:image:height', content: '630'}],
    ],
    vite: {
        publicDir: '_public',
        resolve: {
            alias: [{find: '@', replacement: path.resolve(__dirname, '../src')}],
        },
        build: {
            target: 'es2022',  // Support top-level await, site only for developers anyway
        },
    },
    themeConfig: {
        logo: '/icon.svg',
        nav: [
            {text: "Creator", link: 'https://gracious.tech/'},
            {text: "Source code", link: 'https://github.com/gracious-tech/fetch'},
            {text: "Contact", link: 'https://gracious.tech/support/'},
            {text: "Donate", link: 'https://give.gracious.tech'},
        ],
        sidebar: [
            {
                text: '',
                items: [
                    {text: "Overview", link: '/overview/'},
                ],
            },
            {
                text: "Bible translations",
                items: [
                    {text: "What's included", link: '/content/'},
                    {text: "Languages", link: '/content/languages/'},
                    {text: "Bibles", link: '/content/bibles/'},
                    {text: "Statistics", link: '/content/stats/'},
                    {text: "Need", link: '/content/need/'},
                ],
            },
            {
                text: "Accessing content",
                items: [
                    {text: "How to access", link: '/access/'},
                    {text: "Web app (UI)", link: '/access/app/'},
                    {text: "Client (API)", link: '/access/client/'},
                    {text: "Manual access", link: '/access/manual/'},
                    {text: "Collections", link: '/access/collections/'},
                ],
            },
            {
                text: "Fine print",
                items: [
                    {text: "Terms of service", link: '/legal/terms/'},
                    {text: "Privacy policy", link: '/legal/privacy/'},
                    {text: "Credits", link: '/legal/credits/'},
                ],
            },
        ],
    },
})
