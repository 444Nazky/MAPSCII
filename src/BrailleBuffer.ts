/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  Simple pixel to braille character mapper

  Implementation inspired by node-drawille (https://github.com/madbence/node-drawille)
  * added color support
  * added text label support
  * general optimizations

  Will either be merged into node-drawille or become an own module at some point
*/
'use strict';

const stringWidth = require('string-width');
const config = require('./config');
const utils = require('./utils');

const asciiMap: { [key: string]: number[] } = {
  // '▬': [2+32, 4+64],
  // '¯': [1+16],
  '▀': [1 + 2 + 16 + 32],
  '▄': [4 + 8 + 64 + 128],
  '■': [2 + 4 + 32 + 64],
  '▌': [1 + 2 + 4 + 8],
  '▐': [16 + 32 + 64 + 128],
  // '▓': [1+4+32+128, 2+8+16+64],
  '█': [255],
};

const termReset = '\x1B[39;49m';

class BrailleBuffer {
  private brailleMap: number[][];
  private pixelBuffer: Buffer;
  private charBuffer: (string | undefined)[];
  private foregroundBuffer: Buffer;
  private backgroundBuffer: Buffer;
  private asciiToBraille: string[];
  private globalBackground: number | null;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.brailleMap = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]];

    this.pixelBuffer = Buffer.alloc(0);
    this.charBuffer = [];
    this.foregroundBuffer = Buffer.alloc(0);
    this.backgroundBuffer = Buffer.alloc(0);

    this.asciiToBraille = [];

    this.globalBackground = null;

    this.width = width;
    this.height = height;

    const size = width * height / 8;
    this.pixelBuffer = Buffer.alloc(size);
    this.foregroundBuffer = Buffer.alloc(size);
    this.backgroundBuffer = Buffer.alloc(size);

    this._mapBraille();
    this.clear();
  }

  clear(): void {
    this.pixelBuffer.fill(0);
    this.charBuffer = [];
    this.foregroundBuffer.fill(0);
    this.backgroundBuffer.fill(0);
  }

  setGlobalBackground(background: number): void {
    this.globalBackground = background;
  }

  setBackground(x: number, y: number, color: number): void {
    if (0 <= x && x < this.width && 0 <= y && y < this.height) {
      const idx = this._project(x, y);
      this.backgroundBuffer[idx] = color;
    }
  }

  setPixel(x: number, y: number, color: number): void {
    this._locate(x, y, (idx: number, mask: number) => {
      this.pixelBuffer[idx] |= mask;
      this.foregroundBuffer[idx] = color;
    });
  }

  unsetPixel(x: number, y: number): void {
    this._locate(x, y, (idx: number, mask: number) => {
      this.pixelBuffer[idx] &= ~mask;
    });
  }

  private _project(x: number, y: number): number {
    return (x >> 1) + (this.width >> 1) * (y >> 2);
  }

  private _locate(x: number, y: number, cb: (idx: number, mask: number) => void): void {
    if (!((0 <= x && x < this.width) && (0 <= y && y < this.height))) {
      return;
    }
    const idx = this._project(x, y);
    const mask = this.brailleMap[y & 3][x & 1];
    cb(idx, mask);
  }

  private _mapBraille(): void {
    this.asciiToBraille = [' '];

    const masks: { mask: number; char: string }[] = [];
    for (const char in asciiMap) {
      const bits = asciiMap[char];
      if (!(bits instanceof Array)) continue;
      for (const mask of bits) {
        masks.push({
          mask: mask,
          char: char,
        });
      }
    }

    //TODO Optimize this part
    let i: number;
    let k: number;
    const results: string[] = [];
    for (i = k = 1; k <= 255; i = ++k) {
      const braille = (i & 7) + ((i & 56) << 1) + ((i & 64) >> 3) + (i & 128);
      results.push(this.asciiToBraille[i] = masks.reduce((best: { char: string; covered: number } | null, mask: { mask: number; char: string }) => {
        const covered = utils.population(mask.mask & braille);
        if (!best || best.covered < covered) {
          return {
            char: mask.char,
            covered: covered,
          };
        } else {
          return best;
        }
      }, null as { char: string; covered: number } | null)!.char);
    }
  }

  private _termColor(foreground: number | null, background: number | null): string {
    background = background! | this.globalBackground!;
    if (foreground && background) {
      return `\x1B[38;5;${foreground};48;5;${background}m`;
    } else if (foreground) {
      return `\x1B[49;38;5;${foreground}m`;
    } else if (background) {
      return `\x1B[39;48;5;${background}m`;
    } else {
      return termReset;
    }
  }

  frame(): string {
    const output: string[] = [];
    let currentColor: string | null = null;
    let skip = 0;

    for (let y = 0; y < this.height / 4; y++) {
      skip = 0;

      for (let x = 0; x < this.width / 2; x++) {
        const idx = y * this.width / 2 + x;

        if (idx && !x) {
          output.push(config.delimeter);
        }

        const colorCode = this._termColor(this.foregroundBuffer[idx] || null, this.backgroundBuffer[idx] || null);
        if (currentColor !== colorCode) {
          output.push(currentColor = colorCode);
        }

        const char = this.charBuffer[idx];
        if (char) {
          skip += stringWidth(char) - 1;
          if (skip + x < this.width / 2) {
            output.push(char);
          }
        } else {
          if (!skip) {
            if (config.useBraille) {
              output.push(String.fromCharCode(0x2800 + this.pixelBuffer[idx]));
            } else {
              output.push(this.asciiToBraille[this.pixelBuffer[idx]]);
            }
          } else {
            skip--;
          }
        }
      }
    }

    output.push(termReset + config.delimeter);
    return output.join('');
  }

  setChar(char: string, x: number, y: number, color: number): void {
    if (0 <= x && x < this.width && 0 <= y && y < this.height) {
      const idx = this._project(x, y);
      this.charBuffer[idx] = char;
      this.foregroundBuffer[idx] = color;
    }
  }

  writeText(text: string, x: number, y: number, color: number, center: boolean = true): void {
    if (center) {
      x -= text.length / 2 + 1;
    }
    for (let i = 0; i < text.length; i++) {
      this.setChar(text.charAt(i), x + i * 2, y, color);
    }
  }
}

export = BrailleBuffer;

