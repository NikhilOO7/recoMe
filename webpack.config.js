const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isDev = process.env.NODE_ENV !== 'production';

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : false,

  // Popup removed 2026-08-10 (PRODUCT.md D3): it shipped unreachable — the
  // action button opens the web app, which owns the inbox. Source archived
  // in graveyard/2026-08-10-popup-removal/.
  entry: {
    background: './extension/src/background/index.ts',
    content: './extension/src/content/index.ts',
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

      // Extension
      '@shared': path.resolve(__dirname, 'extension/src/shared'),
      '@background': path.resolve(__dirname, 'extension/src/background'),
      '@content': path.resolve(__dirname, 'extension/src/content'),
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

  // No splitChunks: with the popup gone, no entry ships React — background
  // and content stay single-file bundles.

  performance: {
    hints: 'warning',
    maxEntrypointSize: 300000,
    maxAssetSize: 250000,
  },
};
