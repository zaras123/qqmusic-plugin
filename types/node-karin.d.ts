declare module 'node-karin' {
  export const Plugin: any
  export const components: any
  export const defineConfig: (config: any) => any
  export const segment: any
  export const logger: any
  export const render: any
  export const redis: any
  export const getAllBot: any
  export const getAllBotList: any
  export const getBot: any
  export const contactGroup: any
  export const sendMsg: any
  export const tempPath: string
}

declare module 'node-karin/template' {
  const art: any
  export default art
}
