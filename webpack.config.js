const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isDev = process.env.NODE_ENV !== 'production';

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : false,

  entry: {
    background: './extension/src/background/index.ts',
    content: './extension/src/content/index.ts',
    popup: './extension/src/popup/index.tsx',
    // devtools removed from public build — admin panel only
    // devtools: './extension/src/devtools/index.tsx',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      // Shared packages
      '@schema': path.resolve(__dirname, 'packages/schema'),
      '@utils': path.resolve(__dirname, 'packages/utils'),
      '@ui': path.resolve(__dirname, 'packages/ui'),

      // Extension
      '@shared': path.resolve(__dirname, 'extension/src/shared'),
      '@background': path.resolve(__dirname, 'extension/src/background'),
      '@content': path.resolve(__dirname, 'extension/src/content'),
      '@popup': path.resolve(__dirname, 'extension/src/popup'),
    },
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),

    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['vendor', 'popup'],
    }),

    // devtools removed from public build — admin panel only
    // new HtmlWebpackPlugin({
    //   template: './public/devtools.html',
    //   filename: 'devtools.html',
    //   chunks: ['devtools'],
    // }),

    new HtmlWebpackPlugin({
      template: './public/callback.html',
      filename: 'callback.html',
      chunks: [],
      inject: false,
    }),

    new CopyWebpackPlugin({
      patterns: [
        { from: 'extension/src/manifest.json', to: 'manifest.json' },
        { from: 'public/icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],

  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'vendor',
          chunks: (chunk) => chunk.name === 'popup',
        },
      },
    },
  },

  performance: {
    hints: 'warning',
    maxEntrypointSize: 300000,
    maxAssetSize: 250000,
  },
};
