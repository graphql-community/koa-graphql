// flow-typed signature: d39f8c42e21629554940dda3bcbe90e6
// flow-typed version: b80967946f/babel-register_v6.x.x/flow_>=v0.30.x

declare module 'babel-register' {
  declare type Options = {|
    ast?: boolean,
    auxiliaryCommentAfter?: ?string,
    auxiliaryCommentBefore?: ?string,
    babelrc?: boolean,
    code?: boolean,
    comments?: boolean,
    compact?: 'auto' | boolean,
    env?: Object,
    extends?: ?string,
    filename?: string,
    filenameRelative?: string,
    generatorOpts?: Object,
    getModuleId?: void | null | (moduleName: string) => string,
    highlightCode?: boolean,
    ignore?: boolean | string | RegExp | (filename: string) => boolean,
    inputSourceMap?: Object,
    minified?: boolean,
    moduleId?: string,
    moduleIds?: boolean,
    moduleRoot?: string,
    only?: RegExp,
    parserOpts?: Object,
    plugins?: Array<[string, Object] | string>,
    presets?: Array<string>,
    retainLines?: boolean,
    resolveModuleSource?: null | (source: string, filename: string) => boolean,
    shouldPrintComment?: null | (commentContents: string) => string,
    sourceFileName?: string,
    sourceMaps?: boolean | 'inline' | 'both',
    sourceMapTarget?: string,
    sourceRoot?: string,
    sourceType?: 'script' | 'module' | 'unambiguous',
    wrapPluginVisitorMethod?: null | (pluginAlias: string, visitorType: string, callback: Function) => boolean,
    extensions?: Array<string>,
    cache?: boolean,
  |};

  declare module.exports: (options?: Options) => void;
}
