(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{"buffer":2,"oMfpAn":6}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/index.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer")
},{"base64-js":3,"buffer":2,"ieee754":4,"oMfpAn":6}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib/b64.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib")
},{"buffer":2,"oMfpAn":6}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754/index.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754")
},{"buffer":2,"oMfpAn":6}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/path-browserify/index.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/path-browserify")
},{"buffer":2,"oMfpAn":6}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/process/browser.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/process")
},{"buffer":2,"oMfpAn":6}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = require('./lib/swig');

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/index.js","/../../node_modules/swig")
},{"./lib/swig":15,"buffer":2,"oMfpAn":6}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('./utils');

var _months = {
    full: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    abbr: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  _days = {
    full: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    abbr: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    alt: {'-1': 'Yesterday', 0: 'Today', 1: 'Tomorrow'}
  };

/*
DateZ is licensed under the MIT License:
Copyright (c) 2011 Tomo Universalis (http://tomouniversalis.com)
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
exports.tzOffset = 0;
exports.DateZ = function () {
  var members = {
      'default': ['getUTCDate', 'getUTCDay', 'getUTCFullYear', 'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCMonth', 'getUTCSeconds', 'toISOString', 'toGMTString', 'toUTCString', 'valueOf', 'getTime'],
      z: ['getDate', 'getDay', 'getFullYear', 'getHours', 'getMilliseconds', 'getMinutes', 'getMonth', 'getSeconds', 'getYear', 'toDateString', 'toLocaleDateString', 'toLocaleTimeString']
    },
    d = this;

  d.date = d.dateZ = (arguments.length > 1) ? new Date(Date.UTC.apply(Date, arguments) + ((new Date()).getTimezoneOffset() * 60000)) : (arguments.length === 1) ? new Date(new Date(arguments['0'])) : new Date();

  d.timezoneOffset = d.dateZ.getTimezoneOffset();

  utils.each(members.z, function (name) {
    d[name] = function () {
      return d.dateZ[name]();
    };
  });
  utils.each(members['default'], function (name) {
    d[name] = function () {
      return d.date[name]();
    };
  });

  this.setTimezoneOffset(exports.tzOffset);
};
exports.DateZ.prototype = {
  getTimezoneOffset: function () {
    return this.timezoneOffset;
  },
  setTimezoneOffset: function (offset) {
    this.timezoneOffset = offset;
    this.dateZ = new Date(this.date.getTime() + this.date.getTimezoneOffset() * 60000 - this.timezoneOffset * 60000);
    return this;
  }
};

// Day
exports.d = function (input) {
  return (input.getDate() < 10 ? '0' : '') + input.getDate();
};
exports.D = function (input) {
  return _days.abbr[input.getDay()];
};
exports.j = function (input) {
  return input.getDate();
};
exports.l = function (input) {
  return _days.full[input.getDay()];
};
exports.N = function (input) {
  var d = input.getDay();
  return (d >= 1) ? d : 7;
};
exports.S = function (input) {
  var d = input.getDate();
  return (d % 10 === 1 && d !== 11 ? 'st' : (d % 10 === 2 && d !== 12 ? 'nd' : (d % 10 === 3 && d !== 13 ? 'rd' : 'th')));
};
exports.w = function (input) {
  return input.getDay();
};
exports.z = function (input, offset, abbr) {
  var year = input.getFullYear(),
    e = new exports.DateZ(year, input.getMonth(), input.getDate(), 12, 0, 0),
    d = new exports.DateZ(year, 0, 1, 12, 0, 0);

  e.setTimezoneOffset(offset, abbr);
  d.setTimezoneOffset(offset, abbr);
  return Math.round((e - d) / 86400000);
};

// Week
exports.W = function (input) {
  var target = new Date(input.valueOf()),
    dayNr = (input.getDay() + 6) % 7,
    fThurs;

  target.setDate(target.getDate() - dayNr + 3);
  fThurs = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }

  return 1 + Math.ceil((fThurs - target) / 604800000);
};

// Month
exports.F = function (input) {
  return _months.full[input.getMonth()];
};
exports.m = function (input) {
  return (input.getMonth() < 9 ? '0' : '') + (input.getMonth() + 1);
};
exports.M = function (input) {
  return _months.abbr[input.getMonth()];
};
exports.n = function (input) {
  return input.getMonth() + 1;
};
exports.t = function (input) {
  return 32 - (new Date(input.getFullYear(), input.getMonth(), 32).getDate());
};

// Year
exports.L = function (input) {
  return new Date(input.getFullYear(), 1, 29).getDate() === 29;
};
exports.o = function (input) {
  var target = new Date(input.valueOf());
  target.setDate(target.getDate() - ((input.getDay() + 6) % 7) + 3);
  return target.getFullYear();
};
exports.Y = function (input) {
  return input.getFullYear();
};
exports.y = function (input) {
  return (input.getFullYear().toString()).substr(2);
};

// Time
exports.a = function (input) {
  return input.getHours() < 12 ? 'am' : 'pm';
};
exports.A = function (input) {
  return input.getHours() < 12 ? 'AM' : 'PM';
};
exports.B = function (input) {
  var hours = input.getUTCHours(), beats;
  hours = (hours === 23) ? 0 : hours + 1;
  beats = Math.abs(((((hours * 60) + input.getUTCMinutes()) * 60) + input.getUTCSeconds()) / 86.4).toFixed(0);
  return ('000'.concat(beats).slice(beats.length));
};
exports.g = function (input) {
  var h = input.getHours();
  return h === 0 ? 12 : (h > 12 ? h - 12 : h);
};
exports.G = function (input) {
  return input.getHours();
};
exports.h = function (input) {
  var h = input.getHours();
  return ((h < 10 || (12 < h && 22 > h)) ? '0' : '') + ((h < 12) ? h : h - 12);
};
exports.H = function (input) {
  var h = input.getHours();
  return (h < 10 ? '0' : '') + h;
};
exports.i = function (input) {
  var m = input.getMinutes();
  return (m < 10 ? '0' : '') + m;
};
exports.s = function (input) {
  var s = input.getSeconds();
  return (s < 10 ? '0' : '') + s;
};
//u = function () { return ''; },

// Timezone
//e = function () { return ''; },
//I = function () { return ''; },
exports.O = function (input) {
  var tz = input.getTimezoneOffset();
  return (tz < 0 ? '-' : '+') + (tz / 60 < 10 ? '0' : '') + Math.abs((tz / 60)) + '00';
};
//T = function () { return ''; },
exports.Z = function (input) {
  return input.getTimezoneOffset() * 60;
};

// Full Date/Time
exports.c = function (input) {
  return input.toISOString();
};
exports.r = function (input) {
  return input.toUTCString();
};
exports.U = function (input) {
  return input.getTime() / 1000;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/dateformatter.js","/../../node_modules/swig/lib")
},{"./utils":32,"buffer":2,"oMfpAn":6}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('./utils'),
  dateFormatter = require('./dateformatter');

/**
 * Helper method to recursively run a filter across an object/array and apply it to all of the object/array's values.
 * @param  {*} input
 * @return {*}
 * @private
 */
function iterateFilter(input) {
  var self = this,
    out = {};

  if (utils.isArray(input)) {
    return utils.map(input, function (value) {
      return self.apply(null, arguments);
    });
  }

  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      out[key] = self.apply(null, arguments);
    });
    return out;
  }

  return;
}

/**
 * Backslash-escape characters that need to be escaped.
 *
 * @example
 * {{ "\"quoted string\""|addslashes }}
 * // => \"quoted string\"
 *
 * @param  {*}  input
 * @return {*}        Backslash-escaped string.
 */
exports.addslashes = function (input) {
  var out = iterateFilter.apply(exports.addslashes, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.replace(/\\/g, '\\\\').replace(/\'/g, "\\'").replace(/\"/g, '\\"');
};

/**
 * Upper-case the first letter of the input and lower-case the rest.
 *
 * @example
 * {{ "i like Burritos"|capitalize }}
 * // => I like burritos
 *
 * @param  {*} input  If given an array or object, each string member will be run through the filter individually.
 * @return {*}        Returns the same type as the input.
 */
exports.capitalize = function (input) {
  var out = iterateFilter.apply(exports.capitalize, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.toString().charAt(0).toUpperCase() + input.toString().substr(1).toLowerCase();
};

/**
 * Format a date or Date-compatible string.
 *
 * @example
 * // now = new Date();
 * {{ now|date('Y-m-d') }}
 * // => 2013-08-14
 *
 * @param  {?(string|date)} input
 * @param  {string} format  PHP-style date format compatible string.
 * @param  {number=} offset Timezone offset from GMT in minutes.
 * @param  {string=} abbr   Timezone abbreviation. Used for output only.
 * @return {string}         Formatted date string.
 */
exports.date = function (input, format, offset, abbr) {
  var l = format.length,
    date = new dateFormatter.DateZ(input),
    cur,
    i = 0,
    out = '';

  if (offset) {
    date.setTimezoneOffset(offset, abbr);
  }

  for (i; i < l; i += 1) {
    cur = format.charAt(i);
    if (dateFormatter.hasOwnProperty(cur)) {
      out += dateFormatter[cur](date, offset, abbr);
    } else {
      out += cur;
    }
  }
  return out;
};

/**
 * If the input is `undefined`, `null`, or `false`, a default return value can be specified.
 *
 * @example
 * {{ null_value|default('Tacos') }}
 * // => Tacos
 *
 * @example
 * {{ "Burritos"|default("Tacos") }}
 * // => Burritos
 *
 * @param  {*}  input
 * @param  {*}  def     Value to return if `input` is `undefined`, `null`, or `false`.
 * @return {*}          `input` or `def` value.
 */
exports["default"] = function (input, def) {
  return (typeof input !== 'undefined' && (input || typeof input === 'number')) ? input : def;
};

/**
 * Force escape the output of the variable. Optionally use `e` as a shortcut filter name. This filter will be applied by default if autoescape is turned on.
 *
 * @example
 * {{ "<blah>"|escape }}
 * // => &lt;blah&gt;
 *
 * @example
 * {{ "<blah>"|e("js") }}
 * // => \u003Cblah\u003E
 *
 * @param  {*} input
 * @param  {string} [type='html']   If you pass the string js in as the type, output will be escaped so that it is safe for JavaScript execution.
 * @return {string}         Escaped string.
 */
exports.escape = function (input, type) {
  var out = iterateFilter.apply(exports.escape, arguments),
    inp = input,
    i = 0,
    code;

  if (out !== undefined) {
    return out;
  }

  if (typeof input !== 'string') {
    return input;
  }

  out = '';

  switch (type) {
  case 'js':
    inp = inp.replace(/\\/g, '\\u005C');
    for (i; i < inp.length; i += 1) {
      code = inp.charCodeAt(i);
      if (code < 32) {
        code = code.toString(16).toUpperCase();
        code = (code.length < 2) ? '0' + code : code;
        out += '\\u00' + code;
      } else {
        out += inp[i];
      }
    }
    return out.replace(/&/g, '\\u0026')
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/\'/g, '\\u0027')
      .replace(/"/g, '\\u0022')
      .replace(/\=/g, '\\u003D')
      .replace(/-/g, '\\u002D')
      .replace(/;/g, '\\u003B');

  default:
    return inp.replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
exports.e = exports.escape;

/**
 * Get the first item in an array or character in a string. All other objects will attempt to return the first value available.
 *
 * @example
 * // my_arr = ['a', 'b', 'c']
 * {{ my_arr|first }}
 * // => a
 *
 * @example
 * // my_val = 'Tacos'
 * {{ my_val|first }}
 * // T
 *
 * @param  {*} input
 * @return {*}        The first item of the array or first character of the string input.
 */
exports.first = function (input) {
  if (typeof input === 'object' && !utils.isArray(input)) {
    var keys = utils.keys(input);
    return input[keys[0]];
  }

  if (typeof input === 'string') {
    return input.substr(0, 1);
  }

  return input[0];
};

/**
 * Group an array of objects by a common key. If an array is not provided, the input value will be returned untouched.
 *
 * @example
 * // people = [{ age: 23, name: 'Paul' }, { age: 26, name: 'Jane' }, { age: 23, name: 'Jim' }];
 * {% for agegroup in people|groupBy('age') %}
 *   <h2>{{ loop.key }}</h2>
 *   <ul>
 *     {% for person in agegroup %}
 *     <li>{{ person.name }}</li>
 *     {% endfor %}
 *   </ul>
 * {% endfor %}
 *
 * @param  {*}      input Input object.
 * @param  {string} key   Key to group by.
 * @return {object}       Grouped arrays by given key.
 */
exports.groupBy = function (input, key) {
  if (!utils.isArray(input)) {
    return input;
  }

  var out = {};

  utils.each(input, function (value) {
    if (!value.hasOwnProperty(key)) {
      return;
    }

    var keyname = value[key],
      newVal = utils.extend({}, value);
    delete value[key];

    if (!out[keyname]) {
      out[keyname] = [];
    }

    out[keyname].push(value);
  });

  return out;
};

/**
 * Join the input with a string.
 *
 * @example
 * // my_array = ['foo', 'bar', 'baz']
 * {{ my_array|join(', ') }}
 * // => foo, bar, baz
 *
 * @example
 * // my_key_object = { a: 'foo', b: 'bar', c: 'baz' }
 * {{ my_key_object|join(' and ') }}
 * // => foo and bar and baz
 *
 * @param  {*}  input
 * @param  {string} glue    String value to join items together.
 * @return {string}
 */
exports.join = function (input, glue) {
  if (utils.isArray(input)) {
    return input.join(glue);
  }

  if (typeof input === 'object') {
    var out = [];
    utils.each(input, function (value) {
      out.push(value);
    });
    return out.join(glue);
  }
  return input;
};

/**
 * Return a string representation of an JavaScript object.
 *
 * Backwards compatible with swig@0.x.x using `json_encode`.
 *
 * @example
 * // val = { a: 'b' }
 * {{ val|json }}
 * // => {"a":"b"}
 *
 * @example
 * // val = { a: 'b' }
 * {{ val|json(4) }}
 * // => {
 * //        "a": "b"
 * //    }
 *
 * @param  {*}    input
 * @param  {number}  [indent]  Number of spaces to indent for pretty-formatting.
 * @return {string}           A valid JSON string.
 */
exports.json = function (input, indent) {
  return JSON.stringify(input, null, indent || 0);
};
exports.json_encode = exports.json;

/**
 * Get the last item in an array or character in a string. All other objects will attempt to return the last value available.
 *
 * @example
 * // my_arr = ['a', 'b', 'c']
 * {{ my_arr|last }}
 * // => c
 *
 * @example
 * // my_val = 'Tacos'
 * {{ my_val|last }}
 * // s
 *
 * @param  {*} input
 * @return {*}          The last item of the array or last character of the string.input.
 */
exports.last = function (input) {
  if (typeof input === 'object' && !utils.isArray(input)) {
    var keys = utils.keys(input);
    return input[keys[keys.length - 1]];
  }

  if (typeof input === 'string') {
    return input.charAt(input.length - 1);
  }

  return input[input.length - 1];
};

/**
 * Return the input in all lowercase letters.
 *
 * @example
 * {{ "FOOBAR"|lower }}
 * // => foobar
 *
 * @example
 * // myObj = { a: 'FOO', b: 'BAR' }
 * {{ myObj|lower|join('') }}
 * // => foobar
 *
 * @param  {*}  input
 * @return {*}          Returns the same type as the input.
 */
exports.lower = function (input) {
  var out = iterateFilter.apply(exports.lower, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.toString().toLowerCase();
};

/**
 * Deprecated in favor of <a href="#safe">safe</a>.
 */
exports.raw = function (input) {
  return exports.safe(input);
};
exports.raw.safe = true;

/**
 * Returns a new string with the matched search pattern replaced by the given replacement string. Uses JavaScript's built-in String.replace() method.
 *
 * @example
 * // my_var = 'foobar';
 * {{ my_var|replace('o', 'e', 'g') }}
 * // => feebar
 *
 * @example
 * // my_var = "farfegnugen";
 * {{ my_var|replace('^f', 'p') }}
 * // => parfegnugen
 *
 * @example
 * // my_var = 'a1b2c3';
 * {{ my_var|replace('\w', '0', 'g') }}
 * // => 010203
 *
 * @param  {string} input
 * @param  {string} search      String or pattern to replace from the input.
 * @param  {string} replacement String to replace matched pattern.
 * @param  {string} [flags]      Regular Expression flags. 'g': global match, 'i': ignore case, 'm': match over multiple lines
 * @return {string}             Replaced string.
 */
exports.replace = function (input, search, replacement, flags) {
  var r = new RegExp(search, flags);
  return input.replace(r, replacement);
};

/**
 * Reverse sort the input. This is an alias for <code data-language="swig">{{ input|sort(true) }}</code>.
 *
 * @example
 * // val = [1, 2, 3];
 * {{ val|reverse }}
 * // => 3,2,1
 *
 * @param  {array}  input
 * @return {array}        Reversed array. The original input object is returned if it was not an array.
 */
exports.reverse = function (input) {
  return exports.sort(input, true);
};

/**
 * Forces the input to not be auto-escaped. Use this only on content that you know is safe to be rendered on your page.
 *
 * @example
 * // my_var = "<p>Stuff</p>";
 * {{ my_var|safe }}
 * // => <p>Stuff</p>
 *
 * @param  {*}  input
 * @return {*}          The input exactly how it was given, regardless of autoescaping status.
 */
exports.safe = function (input) {
  // This is a magic filter. Its logic is hard-coded into Swig's parser.
  return input;
};
exports.safe.safe = true;

/**
 * Sort the input in an ascending direction.
 * If given an object, will return the keys as a sorted array.
 * If given a string, each character will be sorted individually.
 *
 * @example
 * // val = [2, 6, 4];
 * {{ val|sort }}
 * // => 2,4,6
 *
 * @example
 * // val = 'zaq';
 * {{ val|sort }}
 * // => aqz
 *
 * @example
 * // val = { bar: 1, foo: 2 }
 * {{ val|sort(true) }}
 * // => foo,bar
 *
 * @param  {*} input
 * @param {boolean} [reverse=false] Output is given reverse-sorted if true.
 * @return {*}        Sorted array;
 */
exports.sort = function (input, reverse) {
  var out;
  if (utils.isArray(input)) {
    out = input.sort();
  } else {
    switch (typeof input) {
    case 'object':
      out = utils.keys(input).sort();
      break;
    case 'string':
      out = input.split('');
      if (reverse) {
        return out.reverse().join('');
      }
      return out.sort().join('');
    }
  }

  if (out && reverse) {
    return out.reverse();
  }

  return out || input;
};

/**
 * Strip HTML tags.
 *
 * @example
 * // stuff = '<p>foobar</p>';
 * {{ stuff|striptags }}
 * // => foobar
 *
 * @param  {*}  input
 * @return {*}        Returns the same object as the input, but with all string values stripped of tags.
 */
exports.striptags = function (input) {
  var out = iterateFilter.apply(exports.striptags, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.toString().replace(/(<([^>]+)>)/ig, '');
};

/**
 * Capitalizes every word given and lower-cases all other letters.
 *
 * @example
 * // my_str = 'this is soMe text';
 * {{ my_str|title }}
 * // => This Is Some Text
 *
 * @example
 * // my_arr = ['hi', 'this', 'is', 'an', 'array'];
 * {{ my_arr|title|join(' ') }}
 * // => Hi This Is An Array
 *
 * @param  {*}  input
 * @return {*}        Returns the same object as the input, but with all words in strings title-cased.
 */
exports.title = function (input) {
  var out = iterateFilter.apply(exports.title, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.toString().replace(/\w\S*/g, function (str) {
    return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
  });
};

/**
 * Remove all duplicate items from an array.
 *
 * @example
 * // my_arr = [1, 2, 3, 4, 4, 3, 2, 1];
 * {{ my_arr|uniq|join(',') }}
 * // => 1,2,3,4
 *
 * @param  {array}  input
 * @return {array}        Array with unique items. If input was not an array, the original item is returned untouched.
 */
exports.uniq = function (input) {
  var result;

  if (!input || !utils.isArray(input)) {
    return '';
  }

  result = [];
  utils.each(input, function (v) {
    if (result.indexOf(v) === -1) {
      result.push(v);
    }
  });
  return result;
};

/**
 * Convert the input to all uppercase letters. If an object or array is provided, all values will be uppercased.
 *
 * @example
 * // my_str = 'tacos';
 * {{ my_str|upper }}
 * // => TACOS
 *
 * @example
 * // my_arr = ['tacos', 'burritos'];
 * {{ my_arr|upper|join(' & ') }}
 * // => TACOS & BURRITOS
 *
 * @param  {*}  input
 * @return {*}        Returns the same type as the input, with all strings upper-cased.
 */
exports.upper = function (input) {
  var out = iterateFilter.apply(exports.upper, arguments);
  if (out !== undefined) {
    return out;
  }

  return input.toString().toUpperCase();
};

/**
 * URL-encode a string. If an object or array is passed, all values will be URL-encoded.
 *
 * @example
 * // my_str = 'param=1&anotherParam=2';
 * {{ my_str|url_encode }}
 * // => param%3D1%26anotherParam%3D2
 *
 * @param  {*} input
 * @return {*}       URL-encoded string.
 */
exports.url_encode = function (input) {
  var out = iterateFilter.apply(exports.url_encode, arguments);
  if (out !== undefined) {
    return out;
  }
  return encodeURIComponent(input);
};

/**
 * URL-decode a string. If an object or array is passed, all values will be URL-decoded.
 *
 * @example
 * // my_str = 'param%3D1%26anotherParam%3D2';
 * {{ my_str|url_decode }}
 * // => param=1&anotherParam=2
 *
 * @param  {*} input
 * @return {*}       URL-decoded string.
 */
exports.url_decode = function (input) {
  var out = iterateFilter.apply(exports.url_decode, arguments);
  if (out !== undefined) {
    return out;
  }
  return decodeURIComponent(input);
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/filters.js","/../../node_modules/swig/lib")
},{"./dateformatter":8,"./utils":32,"buffer":2,"oMfpAn":6}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('./utils');

/**
 * A lexer token.
 * @typedef {object} LexerToken
 * @property {string} match  The string that was matched.
 * @property {number} type   Lexer type enum.
 * @property {number} length Length of the original string processed.
 */

/**
 * Enum for token types.
 * @readonly
 * @enum {number}
 */
var TYPES = {
    /** Whitespace */
    WHITESPACE: 0,
    /** Plain string */
    STRING: 1,
    /** Variable filter */
    FILTER: 2,
    /** Empty variable filter */
    FILTEREMPTY: 3,
    /** Function */
    FUNCTION: 4,
    /** Function with no arguments */
    FUNCTIONEMPTY: 5,
    /** Open parenthesis */
    PARENOPEN: 6,
    /** Close parenthesis */
    PARENCLOSE: 7,
    /** Comma */
    COMMA: 8,
    /** Variable */
    VAR: 9,
    /** Number */
    NUMBER: 10,
    /** Math operator */
    OPERATOR: 11,
    /** Open square bracket */
    BRACKETOPEN: 12,
    /** Close square bracket */
    BRACKETCLOSE: 13,
    /** Key on an object using dot-notation */
    DOTKEY: 14,
    /** Start of an array */
    ARRAYOPEN: 15,
    /** End of an array
     * Currently unused
    ARRAYCLOSE: 16, */
    /** Open curly brace */
    CURLYOPEN: 17,
    /** Close curly brace */
    CURLYCLOSE: 18,
    /** Colon (:) */
    COLON: 19,
    /** JavaScript-valid comparator */
    COMPARATOR: 20,
    /** Boolean logic */
    LOGIC: 21,
    /** Boolean logic "not" */
    NOT: 22,
    /** true or false */
    BOOL: 23,
    /** Variable assignment */
    ASSIGNMENT: 24,
    /** Start of a method */
    METHODOPEN: 25,
    /** End of a method
     * Currently unused
    METHODEND: 26, */
    /** Unknown type */
    UNKNOWN: 100
  },
  rules = [
    {
      type: TYPES.WHITESPACE,
      regex: [
        /^\s+/
      ]
    },
    {
      type: TYPES.STRING,
      regex: [
        /^""/,
        /^".*?[^\\]"/,
        /^''/,
        /^'.*?[^\\]'/
      ]
    },
    {
      type: TYPES.FILTER,
      regex: [
        /^\|\s*(\w+)\(/
      ],
      idx: 1
    },
    {
      type: TYPES.FILTEREMPTY,
      regex: [
        /^\|\s*(\w+)/
      ],
      idx: 1
    },
    {
      type: TYPES.FUNCTIONEMPTY,
      regex: [
        /^\s*(\w+)\(\)/
      ],
      idx: 1
    },
    {
      type: TYPES.FUNCTION,
      regex: [
        /^\s*(\w+)\(/
      ],
      idx: 1
    },
    {
      type: TYPES.PARENOPEN,
      regex: [
        /^\(/
      ]
    },
    {
      type: TYPES.PARENCLOSE,
      regex: [
        /^\)/
      ]
    },
    {
      type: TYPES.COMMA,
      regex: [
        /^,/
      ]
    },
    {
      type: TYPES.LOGIC,
      regex: [
        /^(&&|\|\|)\s*/,
        /^(and|or)\s+/
      ],
      idx: 1,
      replace: {
        'and': '&&',
        'or': '||'
      }
    },
    {
      type: TYPES.COMPARATOR,
      regex: [
        /^(===|==|\!==|\!=|<=|<|>=|>|in\s|gte\s|gt\s|lte\s|lt\s)\s*/
      ],
      idx: 1,
      replace: {
        'gte': '>=',
        'gt': '>',
        'lte': '<=',
        'lt': '<'
      }
    },
    {
      type: TYPES.ASSIGNMENT,
      regex: [
        /^(=|\+=|-=|\*=|\/=)/
      ]
    },
    {
      type: TYPES.NOT,
      regex: [
        /^\!\s*/,
        /^not\s+/
      ],
      replace: {
        'not': '!'
      }
    },
    {
      type: TYPES.BOOL,
      regex: [
        /^(true|false)\s+/,
        /^(true|false)$/
      ],
      idx: 1
    },
    {
      type: TYPES.VAR,
      regex: [
        /^[a-zA-Z_$]\w*((\.\w*)+)?/,
        /^[a-zA-Z_$]\w*/
      ]
    },
    {
      type: TYPES.BRACKETOPEN,
      regex: [
        /^\[/
      ]
    },
    {
      type: TYPES.BRACKETCLOSE,
      regex: [
        /^\]/
      ]
    },
    {
      type: TYPES.CURLYOPEN,
      regex: [
        /^\{/
      ]
    },
    {
      type: TYPES.COLON,
      regex: [
        /^\:/
      ]
    },
    {
      type: TYPES.CURLYCLOSE,
      regex: [
        /^\}/
      ]
    },
    {
      type: TYPES.DOTKEY,
      regex: [
        /^\.(\w+)/,
      ],
      idx: 1
    },
    {
      type: TYPES.NUMBER,
      regex: [
        /^[+\-]?\d+(\.\d+)?/
      ]
    },
    {
      type: TYPES.OPERATOR,
      regex: [
        /^(\+|\-|\/|\*|%)/
      ]
    }
  ];

exports.types = TYPES;

/**
 * Return the token type object for a single chunk of a string.
 * @param  {string} str String chunk.
 * @return {LexerToken}     Defined type, potentially stripped or replaced with more suitable content.
 * @private
 */
function reader(str) {
  var matched;

  utils.some(rules, function (rule) {
    return utils.some(rule.regex, function (regex) {
      var match = str.match(regex),
        normalized;

      if (!match) {
        return;
      }

      normalized = match[rule.idx || 0].replace(/\s*$/, '');
      normalized = (rule.hasOwnProperty('replace') && rule.replace.hasOwnProperty(normalized)) ? rule.replace[normalized] : normalized;

      matched = {
        match: normalized,
        type: rule.type,
        length: match[0].length
      };
      return true;
    });
  });

  if (!matched) {
    matched = {
      match: str,
      type: TYPES.UNKNOWN,
      length: str.length
    };
  }

  return matched;
}

/**
 * Read a string and break it into separate token types.
 * @param  {string} str
 * @return {Array.LexerToken}     Array of defined types, potentially stripped or replaced with more suitable content.
 * @private
 */
exports.read = function (str) {
  var offset = 0,
    tokens = [],
    substr,
    match;
  while (offset < str.length) {
    substr = str.substring(offset);
    match = reader(substr);
    offset += match.length;
    tokens.push(match);
  }
  return tokens;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/lexer.js","/../../node_modules/swig/lib")
},{"./utils":32,"buffer":2,"oMfpAn":6}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var fs = require('fs'),
  path = require('path');

/**
 * Loads templates from the file system.
 * @alias swig.loaders.fs
 * @example
 * swig.setDefaults({ loader: swig.loaders.fs() });
 * @example
 * // Load Templates from a specific directory (does not require using relative paths in your templates)
 * swig.setDefaults({ loader: swig.loaders.fs(__dirname + '/templates' )});
 * @param {string}   [basepath='']     Path to the templates as string. Assigning this value allows you to use semi-absolute paths to templates instead of relative paths.
 * @param {string}   [encoding='utf8']   Template encoding
 */
module.exports = function (basepath, encoding) {
  var ret = {};

  encoding = encoding || 'utf8';
  basepath = (basepath) ? path.normalize(basepath) : null;

  /**
   * Resolves <var>to</var> to an absolute path or unique identifier. This is used for building correct, normalized, and absolute paths to a given template.
   * @alias resolve
   * @param  {string} to        Non-absolute identifier or pathname to a file.
   * @param  {string} [from]    If given, should attempt to find the <var>to</var> path in relation to this given, known path.
   * @return {string}
   */
  ret.resolve = function (to, from) {
    if (basepath) {
      from = basepath;
    } else {
      from = (from) ? path.dirname(from) : '/';
    }
    return path.resolve(from, to);
  };

  /**
   * Loads a single template. Given a unique <var>identifier</var> found by the <var>resolve</var> method this should return the given template.
   * @alias load
   * @param  {string}   identifier  Unique identifier of a template (possibly an absolute path).
   * @param  {function} [cb]        Asynchronous callback function. If not provided, this method should run synchronously.
   * @return {string}               Template source string.
   */
  ret.load = function (identifier, cb) {
    if (!fs || (cb && !fs.readFile) || !fs.readFileSync) {
      throw new Error('Unable to find file ' + identifier + ' because there is no filesystem to read from.');
    }

    identifier = ret.resolve(identifier);

    if (cb) {
      fs.readFile(identifier, encoding, cb);
      return;
    }
    return fs.readFileSync(identifier, encoding);
  };

  return ret;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/loaders/filesystem.js","/../../node_modules/swig/lib/loaders")
},{"buffer":2,"fs":1,"oMfpAn":6,"path":5}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * @namespace TemplateLoader
 * @description Swig is able to accept custom template loaders written by you, so that your templates can come from your favorite storage medium without needing to be part of the core library.
 * A template loader consists of two methods: <var>resolve</var> and <var>load</var>. Each method is used internally by Swig to find and load the source of the template before attempting to parse and compile it.
 * @example
 * // A theoretical memcached loader
 * var path = require('path'),
 *   Memcached = require('memcached');
 * function memcachedLoader(locations, options) {
 *   var memcached = new Memcached(locations, options);
 *   return {
 *     resolve: function (to, from) {
 *       return path.resolve(from, to);
 *     },
 *     load: function (identifier, cb) {
 *       memcached.get(identifier, function (err, data) {
 *         // if (!data) { load from filesystem; }
 *         cb(err, data);
 *       });
 *     }
 *   };
 * };
 * // Tell swig about the loader:
 * swig.setDefaults({ loader: memcachedLoader(['192.168.0.2']) });
 */

/**
 * @function
 * @name resolve
 * @memberof TemplateLoader
 * @description
 * Resolves <var>to</var> to an absolute path or unique identifier. This is used for building correct, normalized, and absolute paths to a given template.
 * @param  {string} to        Non-absolute identifier or pathname to a file.
 * @param  {string} [from]    If given, should attempt to find the <var>to</var> path in relation to this given, known path.
 * @return {string}
 */

/**
 * @function
 * @name load
 * @memberof TemplateLoader
 * @description
 * Loads a single template. Given a unique <var>identifier</var> found by the <var>resolve</var> method this should return the given template.
 * @param  {string}   identifier  Unique identifier of a template (possibly an absolute path).
 * @param  {function} [cb]        Asynchronous callback function. If not provided, this method should run synchronously.
 * @return {string}               Template source string.
 */

/**
 * @private
 */
exports.fs = require('./filesystem');
exports.memory = require('./memory');

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/loaders/index.js","/../../node_modules/swig/lib/loaders")
},{"./filesystem":11,"./memory":13,"buffer":2,"oMfpAn":6}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var path = require('path'),
  utils = require('../utils');

/**
 * Loads templates from a provided object mapping.
 * @alias swig.loaders.memory
 * @example
 * var templates = {
 *   "layout": "{% block content %}{% endblock %}",
 *   "home.html": "{% extends 'layout.html' %}{% block content %}...{% endblock %}"
 * };
 * swig.setDefaults({ loader: swig.loaders.memory(templates) });
 *
 * @param {object} mapping Hash object with template paths as keys and template sources as values.
 * @param {string} [basepath] Path to the templates as string. Assigning this value allows you to use semi-absolute paths to templates instead of relative paths.
 */
module.exports = function (mapping, basepath) {
  var ret = {};

  basepath = (basepath) ? path.normalize(basepath) : null;

  /**
   * Resolves <var>to</var> to an absolute path or unique identifier. This is used for building correct, normalized, and absolute paths to a given template.
   * @alias resolve
   * @param  {string} to        Non-absolute identifier or pathname to a file.
   * @param  {string} [from]    If given, should attempt to find the <var>to</var> path in relation to this given, known path.
   * @return {string}
   */
  ret.resolve = function (to, from) {
    if (basepath) {
      from = basepath;
    } else {
      from = (from) ? path.dirname(from) : '/';
    }
    return path.resolve(from, to);
  };

  /**
   * Loads a single template. Given a unique <var>identifier</var> found by the <var>resolve</var> method this should return the given template.
   * @alias load
   * @param  {string}   identifier  Unique identifier of a template (possibly an absolute path).
   * @param  {function} [cb]        Asynchronous callback function. If not provided, this method should run synchronously.
   * @return {string}               Template source string.
   */
  ret.load = function (pathname, cb) {
    var src, paths;

    paths = [pathname, pathname.replace(/^(\/|\\)/, '')];

    src = mapping[paths[0]] || mapping[paths[1]];
    if (!src) {
      utils.throwError('Unable to find template "' + pathname + '".');
    }

    if (cb) {
      cb(null, src);
      return;
    }
    return src;
  };

  return ret;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/loaders/memory.js","/../../node_modules/swig/lib/loaders")
},{"../utils":32,"buffer":2,"oMfpAn":6,"path":5}],14:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('./utils'),
  lexer = require('./lexer');

var _t = lexer.types,
  _reserved = ['break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with'];


/**
 * Filters are simply functions that perform transformations on their first input argument.
 * Filters are run at render time, so they may not directly modify the compiled template structure in any way.
 * All of Swig's built-in filters are written in this same way. For more examples, reference the `filters.js` file in Swig's source.
 *
 * To disable auto-escaping on a custom filter, simply add a property to the filter method `safe = true;` and the output from this will not be escaped, no matter what the global settings are for Swig.
 *
 * @typedef {function} Filter
 *
 * @example
 * // This filter will return 'bazbop' if the idx on the input is not 'foobar'
 * swig.setFilter('foobar', function (input, idx) {
 *   return input[idx] === 'foobar' ? input[idx] : 'bazbop';
 * });
 * // myvar = ['foo', 'bar', 'baz', 'bop'];
 * // => {{ myvar|foobar(3) }}
 * // Since myvar[3] !== 'foobar', we render:
 * // => bazbop
 *
 * @example
 * // This filter will disable auto-escaping on its output:
 * function bazbop (input) { return input; }
 * bazbop.safe = true;
 * swig.setFilter('bazbop', bazbop);
 * // => {{ "<p>"|bazbop }}
 * // => <p>
 *
 * @param {*} input Input argument, automatically sent from Swig's built-in parser.
 * @param {...*} [args] All other arguments are defined by the Filter author.
 * @return {*}
 */

/*!
 * Makes a string safe for a regular expression.
 * @param  {string} str
 * @return {string}
 * @private
 */
function escapeRegExp(str) {
  return str.replace(/[\-\/\\\^$*+?.()|\[\]{}]/g, '\\$&');
}

/**
 * Parse strings of variables and tags into tokens for future compilation.
 * @class
 * @param {array}   tokens     Pre-split tokens read by the Lexer.
 * @param {object}  filters    Keyed object of filters that may be applied to variables.
 * @param {boolean} autoescape Whether or not this should be autoescaped.
 * @param {number}  line       Beginning line number for the first token.
 * @param {string}  [filename] Name of the file being parsed.
 * @private
 */
function TokenParser(tokens, filters, autoescape, line, filename) {
  this.out = [];
  this.state = [];
  this.filterApplyIdx = [];
  this._parsers = {};
  this.line = line;
  this.filename = filename;
  this.filters = filters;
  this.escape = autoescape;

  this.parse = function () {
    var self = this;

    if (self._parsers.start) {
      self._parsers.start.call(self);
    }
    utils.each(tokens, function (token, i) {
      var prevToken = tokens[i - 1];
      self.isLast = (i === tokens.length - 1);
      if (prevToken) {
        while (prevToken.type === _t.WHITESPACE) {
          i -= 1;
          prevToken = tokens[i - 1];
        }
      }
      self.prevToken = prevToken;
      self.parseToken(token);
    });
    if (self._parsers.end) {
      self._parsers.end.call(self);
    }

    if (self.escape) {
      self.filterApplyIdx = [0];
      if (typeof self.escape === 'string') {
        self.parseToken({ type: _t.FILTER, match: 'e' });
        self.parseToken({ type: _t.COMMA, match: ',' });
        self.parseToken({ type: _t.STRING, match: String(autoescape) });
        self.parseToken({ type: _t.PARENCLOSE, match: ')'});
      } else {
        self.parseToken({ type: _t.FILTEREMPTY, match: 'e' });
      }
    }

    return self.out;
  };
}

TokenParser.prototype = {
  /**
   * Set a custom method to be called when a token type is found.
   *
   * @example
   * parser.on(types.STRING, function (token) {
   *   this.out.push(token.match);
   * });
   * @example
   * parser.on('start', function () {
   *   this.out.push('something at the beginning of your args')
   * });
   * parser.on('end', function () {
   *   this.out.push('something at the end of your args');
   * });
   *
   * @param  {number}   type Token type ID. Found in the Lexer.
   * @param  {Function} fn   Callback function. Return true to continue executing the default parsing function.
   * @return {undefined}
   */
  on: function (type, fn) {
    this._parsers[type] = fn;
  },

  /**
   * Parse a single token.
   * @param  {{match: string, type: number, line: number}} token Lexer token object.
   * @return {undefined}
   * @private
   */
  parseToken: function (token) {
    var self = this,
      fn = self._parsers[token.type] || self._parsers['*'],
      match = token.match,
      prevToken = self.prevToken,
      prevTokenType = prevToken ? prevToken.type : null,
      lastState = (self.state.length) ? self.state[self.state.length - 1] : null,
      temp;

    if (fn && typeof fn === 'function') {
      if (!fn.call(this, token)) {
        return;
      }
    }

    if (lastState && prevToken &&
        lastState === _t.FILTER &&
        prevTokenType === _t.FILTER &&
        token.type !== _t.PARENCLOSE &&
        token.type !== _t.COMMA &&
        token.type !== _t.OPERATOR &&
        token.type !== _t.FILTER &&
        token.type !== _t.FILTEREMPTY) {
      self.out.push(', ');
    }

    if (lastState && lastState === _t.METHODOPEN) {
      self.state.pop();
      if (token.type !== _t.PARENCLOSE) {
        self.out.push(', ');
      }
    }

    switch (token.type) {
    case _t.WHITESPACE:
      break;

    case _t.STRING:
      self.filterApplyIdx.push(self.out.length);
      self.out.push(match.replace(/\\/g, '\\\\'));
      break;

    case _t.NUMBER:
    case _t.BOOL:
      self.filterApplyIdx.push(self.out.length);
      self.out.push(match);
      break;

    case _t.FILTER:
      if (!self.filters.hasOwnProperty(match) || typeof self.filters[match] !== "function") {
        utils.throwError('Invalid filter "' + match + '"', self.line, self.filename);
      }
      self.escape = self.filters[match].safe ? false : self.escape;
      temp = self.filterApplyIdx.pop();
      self.out.splice(temp, 0, '_filters["' + match + '"](');
      self.state.push(token.type);
      self.filterApplyIdx.push(temp);
      break;

    case _t.FILTEREMPTY:
      if (!self.filters.hasOwnProperty(match) || typeof self.filters[match] !== "function") {
        utils.throwError('Invalid filter "' + match + '"', self.line, self.filename);
      }
      self.escape = self.filters[match].safe ? false : self.escape;
      self.out.splice(self.filterApplyIdx[self.filterApplyIdx.length - 1], 0, '_filters["' + match + '"](');
      self.out.push(')');
      break;

    case _t.FUNCTION:
    case _t.FUNCTIONEMPTY:
      self.out.push('((typeof _ctx.' + match + ' !== "undefined") ? _ctx.' + match +
        ' : ((typeof ' + match + ' !== "undefined") ? ' + match +
        ' : _fn))(');
      self.escape = false;
      if (token.type === _t.FUNCTIONEMPTY) {
        self.out[self.out.length - 1] = self.out[self.out.length - 1] + ')';
      } else {
        self.state.push(token.type);
      }
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.PARENOPEN:
      self.state.push(token.type);
      if (self.filterApplyIdx.length) {
        self.out.splice(self.filterApplyIdx[self.filterApplyIdx.length - 1], 0, '(');
        if (prevToken && prevTokenType === _t.VAR) {
          temp = prevToken.match.split('.').slice(0, -1);
          self.out.push(' || _fn).call(' + self.checkMatch(temp));
          self.state.push(_t.METHODOPEN);
          self.escape = false;
        } else {
          self.out.push(' || _fn)(');
        }
        self.filterApplyIdx.push(self.out.length - 3);
      } else {
        self.out.push('(');
        self.filterApplyIdx.push(self.out.length - 1);
      }
      break;

    case _t.PARENCLOSE:
      temp = self.state.pop();
      if (temp !== _t.PARENOPEN && temp !== _t.FUNCTION && temp !== _t.FILTER) {
        utils.throwError('Mismatched nesting state', self.line, self.filename);
      }
      self.out.push(')');
      // Once off the previous entry
      self.filterApplyIdx.pop();
      // Once for the open paren
      self.filterApplyIdx.pop();
      break;

    case _t.COMMA:
      if (lastState !== _t.FUNCTION &&
          lastState !== _t.FILTER &&
          lastState !== _t.ARRAYOPEN &&
          lastState !== _t.CURLYOPEN &&
          lastState !== _t.PARENOPEN &&
          lastState !== _t.COLON) {
        utils.throwError('Unexpected comma', self.line, self.filename);
      }
      if (lastState === _t.COLON) {
        self.state.pop();
      }
      self.out.push(', ');
      self.filterApplyIdx.pop();
      break;

    case _t.LOGIC:
    case _t.COMPARATOR:
      if (!prevToken ||
          prevTokenType === _t.COMMA ||
          prevTokenType === token.type ||
          prevTokenType === _t.BRACKETOPEN ||
          prevTokenType === _t.CURLYOPEN ||
          prevTokenType === _t.PARENOPEN ||
          prevTokenType === _t.FUNCTION) {
        utils.throwError('Unexpected logic', self.line, self.filename);
      }
      self.out.push(token.match);
      break;

    case _t.NOT:
      self.out.push(token.match);
      break;

    case _t.VAR:
      self.parseVar(token, match, lastState);
      break;

    case _t.BRACKETOPEN:
      if (!prevToken ||
          (prevTokenType !== _t.VAR &&
            prevTokenType !== _t.BRACKETCLOSE &&
            prevTokenType !== _t.PARENCLOSE)) {
        self.state.push(_t.ARRAYOPEN);
        self.filterApplyIdx.push(self.out.length);
      } else {
        self.state.push(token.type);
      }
      self.out.push('[');
      break;

    case _t.BRACKETCLOSE:
      temp = self.state.pop();
      if (temp !== _t.BRACKETOPEN && temp !== _t.ARRAYOPEN) {
        utils.throwError('Unexpected closing square bracket', self.line, self.filename);
      }
      self.out.push(']');
      self.filterApplyIdx.pop();
      break;

    case _t.CURLYOPEN:
      self.state.push(token.type);
      self.out.push('{');
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.COLON:
      if (lastState !== _t.CURLYOPEN) {
        utils.throwError('Unexpected colon', self.line, self.filename);
      }
      self.state.push(token.type);
      self.out.push(':');
      self.filterApplyIdx.pop();
      break;

    case _t.CURLYCLOSE:
      if (lastState === _t.COLON) {
        self.state.pop();
      }
      if (self.state.pop() !== _t.CURLYOPEN) {
        utils.throwError('Unexpected closing curly brace', self.line, self.filename);
      }
      self.out.push('}');

      self.filterApplyIdx.pop();
      break;

    case _t.DOTKEY:
      if (!prevToken || (
          prevTokenType !== _t.VAR &&
          prevTokenType !== _t.BRACKETCLOSE &&
          prevTokenType !== _t.DOTKEY &&
          prevTokenType !== _t.PARENCLOSE &&
          prevTokenType !== _t.FUNCTIONEMPTY &&
          prevTokenType !== _t.FILTEREMPTY &&
          prevTokenType !== _t.CURLYCLOSE
        )) {
        utils.throwError('Unexpected key "' + match + '"', self.line, self.filename);
      }
      self.out.push('.' + match);
      break;

    case _t.OPERATOR:
      self.out.push(' ' + match + ' ');
      self.filterApplyIdx.pop();
      break;
    }
  },

  /**
   * Parse variable token
   * @param  {{match: string, type: number, line: number}} token      Lexer token object.
   * @param  {string} match       Shortcut for token.match
   * @param  {number} lastState   Lexer token type state.
   * @return {undefined}
   * @private
   */
  parseVar: function (token, match, lastState) {
    var self = this;

    match = match.split('.');

    if (_reserved.indexOf(match[0]) !== -1) {
      utils.throwError('Reserved keyword "' + match[0] + '" attempted to be used as a variable', self.line, self.filename);
    }

    self.filterApplyIdx.push(self.out.length);
    if (lastState === _t.CURLYOPEN) {
      if (match.length > 1) {
        utils.throwError('Unexpected dot', self.line, self.filename);
      }
      self.out.push(match[0]);
      return;
    }

    self.out.push(self.checkMatch(match));
  },

  /**
   * Return contextual dot-check string for a match
   * @param  {string} match       Shortcut for token.match
   * @private
   */
  checkMatch: function (match) {
    var temp = match[0];

    function checkDot(ctx) {
      var c = ctx + temp,
        m = match,
        build = '';

      build = '(typeof ' + c + ' !== "undefined"';
      utils.each(m, function (v, i) {
        if (i === 0) {
          return;
        }
        build += ' && ' + c + '.' + v + ' !== undefined';
        c += '.' + v;
      });
      build += ')';

      return build;
    }

    function buildDot(ctx) {
      return '(' + checkDot(ctx) + ' ? ' + ctx + match.join('.') + ' : "")';
    }

    return '(' + checkDot('_ctx.') + ' ? ' + buildDot('_ctx.') + ' : ' + buildDot('') + ')';
  }
};

/**
 * Parse a source string into tokens that are ready for compilation.
 *
 * @example
 * exports.parse('{{ tacos }}', {}, tags, filters);
 * // => [{ compile: [Function], ... }]
 *
 * @param  {string} source  Swig template source.
 * @param  {object} opts    Swig options object.
 * @param  {object} tags    Keyed object of tags that can be parsed and compiled.
 * @param  {object} filters Keyed object of filters that may be applied to variables.
 * @return {array}          List of tokens ready for compilation.
 */
exports.parse = function (source, opts, tags, filters) {
  source = source.replace(/\r\n/g, '\n');
  var escape = opts.autoescape,
    tagOpen = opts.tagControls[0],
    tagClose = opts.tagControls[1],
    varOpen = opts.varControls[0],
    varClose = opts.varControls[1],
    escapedTagOpen = escapeRegExp(tagOpen),
    escapedTagClose = escapeRegExp(tagClose),
    escapedVarOpen = escapeRegExp(varOpen),
    escapedVarClose = escapeRegExp(varClose),
    tagStrip = new RegExp('^' + escapedTagOpen + '-?\\s*-?|-?\\s*-?' + escapedTagClose + '$', 'g'),
    tagStripBefore = new RegExp('^' + escapedTagOpen + '-'),
    tagStripAfter = new RegExp('-' + escapedTagClose + '$'),
    varStrip = new RegExp('^' + escapedVarOpen + '-?\\s*-?|-?\\s*-?' + escapedVarClose + '$', 'g'),
    varStripBefore = new RegExp('^' + escapedVarOpen + '-'),
    varStripAfter = new RegExp('-' + escapedVarClose + '$'),
    cmtOpen = opts.cmtControls[0],
    cmtClose = opts.cmtControls[1],
    anyChar = '[\\s\\S]*?',
    // Split the template source based on variable, tag, and comment blocks
    // /(\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|\{#[\s\S]*?#\})/
    splitter = new RegExp(
      '(' +
        escapedTagOpen + anyChar + escapedTagClose + '|' +
        escapedVarOpen + anyChar + escapedVarClose + '|' +
        escapeRegExp(cmtOpen) + anyChar + escapeRegExp(cmtClose) +
        ')'
    ),
    line = 1,
    stack = [],
    parent = null,
    tokens = [],
    blocks = {},
    inRaw = false,
    stripNext;

  /**
   * Parse a variable.
   * @param  {string} str  String contents of the variable, between <i>{{</i> and <i>}}</i>
   * @param  {number} line The line number that this variable starts on.
   * @return {VarToken}      Parsed variable token object.
   * @private
   */
  function parseVariable(str, line) {
    var tokens = lexer.read(utils.strip(str)),
      parser,
      out;

    parser = new TokenParser(tokens, filters, escape, line, opts.filename);
    out = parser.parse().join('');

    if (parser.state.length) {
      utils.throwError('Unable to parse "' + str + '"', line, opts.filename);
    }

    /**
     * A parsed variable token.
     * @typedef {object} VarToken
     * @property {function} compile Method for compiling this token.
     */
    return {
      compile: function () {
        return '_output += ' + out + ';\n';
      }
    };
  }
  exports.parseVariable = parseVariable;

  /**
   * Parse a tag.
   * @param  {string} str  String contents of the tag, between <i>{%</i> and <i>%}</i>
   * @param  {number} line The line number that this tag starts on.
   * @return {TagToken}      Parsed token object.
   * @private
   */
  function parseTag(str, line) {
    var tokens, parser, chunks, tagName, tag, args, last;

    if (utils.startsWith(str, 'end')) {
      last = stack[stack.length - 1];
      if (last && last.name === str.split(/\s+/)[0].replace(/^end/, '') && last.ends) {
        switch (last.name) {
        case 'autoescape':
          escape = opts.autoescape;
          break;
        case 'raw':
          inRaw = false;
          break;
        }
        stack.pop();
        return;
      }

      if (!inRaw) {
        utils.throwError('Unexpected end of tag "' + str.replace(/^end/, '') + '"', line, opts.filename);
      }
    }

    if (inRaw) {
      return;
    }

    chunks = str.split(/\s+(.+)?/);
    tagName = chunks.shift();

    if (!tags.hasOwnProperty(tagName)) {
      utils.throwError('Unexpected tag "' + str + '"', line, opts.filename);
    }

    tokens = lexer.read(utils.strip(chunks.join(' ')));
    parser = new TokenParser(tokens, filters, false, line, opts.filename);
    tag = tags[tagName];

    /**
     * Define custom parsing methods for your tag.
     * @callback parse
     *
     * @example
     * exports.parse = function (str, line, parser, types, options) {
     *   parser.on('start', function () {
     *     // ...
     *   });
     *   parser.on(types.STRING, function (token) {
     *     // ...
     *   });
     * };
     *
     * @param {string} str The full token string of the tag.
     * @param {number} line The line number that this tag appears on.
     * @param {TokenParser} parser A TokenParser instance.
     * @param {TYPES} types Lexer token type enum.
     * @param {TagToken[]} stack The current stack of open tags.
     * @param {SwigOpts} options Swig Options Object.
     */
    if (!tag.parse(chunks[1], line, parser, _t, stack, opts)) {
      utils.throwError('Unexpected tag "' + tagName + '"', line, opts.filename);
    }

    parser.parse();
    args = parser.out;

    switch (tagName) {
    case 'autoescape':
      escape = (args[0] !== 'false') ? args[0] : false;
      break;
    case 'raw':
      inRaw = true;
      break;
    }

    /**
     * A parsed tag token.
     * @typedef {Object} TagToken
     * @property {compile} [compile] Method for compiling this token.
     * @property {array} [args] Array of arguments for the tag.
     * @property {Token[]} [content=[]] An array of tokens that are children of this Token.
     * @property {boolean} [ends] Whether or not this tag requires an end tag.
     * @property {string} name The name of this tag.
     */
    return {
      block: !!tags[tagName].block,
      compile: tag.compile,
      args: args,
      content: [],
      ends: tag.ends,
      name: tagName
    };
  }

  /**
   * Strip the whitespace from the previous token, if it is a string.
   * @param  {object} token Parsed token.
   * @return {object}       If the token was a string, trailing whitespace will be stripped.
   */
  function stripPrevToken(token) {
    if (typeof token === 'string') {
      token = token.replace(/\s*$/, '');
    }
    return token;
  }

  /*!
   * Loop over the source, split via the tag/var/comment regular expression splitter.
   * Send each chunk to the appropriate parser.
   */
  utils.each(source.split(splitter), function (chunk) {
    var token, lines, stripPrev, prevToken, prevChildToken;

    if (!chunk) {
      return;
    }

    // Is a variable?
    if (!inRaw && utils.startsWith(chunk, varOpen) && utils.endsWith(chunk, varClose)) {
      stripPrev = varStripBefore.test(chunk);
      stripNext = varStripAfter.test(chunk);
      token = parseVariable(chunk.replace(varStrip, ''), line);
    // Is a tag?
    } else if (utils.startsWith(chunk, tagOpen) && utils.endsWith(chunk, tagClose)) {
      stripPrev = tagStripBefore.test(chunk);
      stripNext = tagStripAfter.test(chunk);
      token = parseTag(chunk.replace(tagStrip, ''), line);
      if (token) {
        if (token.name === 'extends') {
          parent = token.args.join('').replace(/^\'|\'$/g, '').replace(/^\"|\"$/g, '');
        }

        if (token.block && (!stack.length || token.name === 'block')) {
          blocks[token.args.join('')] = token;
        }
      }
      if (inRaw && !token) {
        token = chunk;
      }
    // Is a content string?
    } else if (inRaw || (!utils.startsWith(chunk, cmtOpen) && !utils.endsWith(chunk, cmtClose))) {
      token = (stripNext) ? chunk.replace(/^\s*/, '') : chunk;
      stripNext = false;
    } else if (utils.startsWith(chunk, cmtOpen) && utils.endsWith(chunk, cmtClose)) {
      return;
    }

    // Did this tag ask to strip previous whitespace? <code>{%- ... %}</code> or <code>{{- ... }}</code>
    if (stripPrev && tokens.length) {
      prevToken = tokens.pop();
      if (typeof prevToken === 'string') {
        prevToken = stripPrevToken(prevToken);
      } else if (prevToken.content && prevToken.content.length) {
        prevChildToken = stripPrevToken(prevToken.content.pop());
        prevToken.content.push(prevChildToken);
      }
      tokens.push(prevToken);
    }

    // This was a comment, so let's just keep going.
    if (!token) {
      return;
    }

    // If there's an open item in the stack, add this to its content.
    if (stack.length) {
      stack[stack.length - 1].content.push(token);
    } else {
      tokens.push(token);
    }

    // If the token is a tag that requires an end tag, open it on the stack.
    if (token.name && token.ends) {
      stack.push(token);
    }

    lines = chunk.match(/\n/g);
    line += (lines) ? lines.length : 0;
  });

  return {
    name: opts.filename,
    parent: parent,
    tokens: tokens,
    blocks: blocks
  };
};


/**
 * Compile an array of tokens.
 * @param  {Token[]} template     An array of template tokens.
 * @param  {Templates[]} parents  Array of parent templates.
 * @param  {SwigOpts} [options]   Swig options object.
 * @param  {string} [blockName]   Name of the current block context.
 * @return {string}               Partial for a compiled JavaScript method that will output a rendered template.
 */
exports.compile = function (template, parents, options, blockName) {
  var out = '',
    tokens = utils.isArray(template) ? template : template.tokens;

  utils.each(tokens, function (token) {
    var o;
    if (typeof token === 'string') {
      out += '_output += "' + token.replace(/\\/g, '\\\\').replace(/\n|\r/g, '\\n').replace(/"/g, '\\"') + '";\n';
      return;
    }

    /**
     * Compile callback for VarToken and TagToken objects.
     * @callback compile
     *
     * @example
     * exports.compile = function (compiler, args, content, parents, options, blockName) {
     *   if (args[0] === 'foo') {
     *     return compiler(content, parents, options, blockName) + '\n';
     *   }
     *   return '_output += "fallback";\n';
     * };
     *
     * @param {parserCompiler} compiler
     * @param {array} [args] Array of parsed arguments on the for the token.
     * @param {array} [content] Array of content within the token.
     * @param {array} [parents] Array of parent templates for the current template context.
     * @param {SwigOpts} [options] Swig Options Object
     * @param {string} [blockName] Name of the direct block parent, if any.
     */
    o = token.compile(exports.compile, token.args ? token.args.slice(0) : [], token.content ? token.content.slice(0) : [], parents, options, blockName);
    out += o || '';
  });

  return out;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/parser.js","/../../node_modules/swig/lib")
},{"./lexer":10,"./utils":32,"buffer":2,"oMfpAn":6}],15:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('./utils'),
  _tags = require('./tags'),
  _filters = require('./filters'),
  parser = require('./parser'),
  dateformatter = require('./dateformatter'),
  loaders = require('./loaders');

/**
 * Swig version number as a string.
 * @example
 * if (swig.version === "1.3.2") { ... }
 *
 * @type {String}
 */
exports.version = "1.3.2";

/**
 * Swig Options Object. This object can be passed to many of the API-level Swig methods to control various aspects of the engine. All keys are optional.
 * @typedef {Object} SwigOpts
 * @property {boolean} autoescape  Controls whether or not variable output will automatically be escaped for safe HTML output. Defaults to <code data-language="js">true</code>. Functions executed in variable statements will not be auto-escaped. Your application/functions should take care of their own auto-escaping.
 * @property {array}   varControls Open and close controls for variables. Defaults to <code data-language="js">['{{', '}}']</code>.
 * @property {array}   tagControls Open and close controls for tags. Defaults to <code data-language="js">['{%', '%}']</code>.
 * @property {array}   cmtControls Open and close controls for comments. Defaults to <code data-language="js">['{#', '#}']</code>.
 * @property {object}  locals      Default variable context to be passed to <strong>all</strong> templates.
 * @property {CacheOptions} cache Cache control for templates. Defaults to saving in <code data-language="js">'memory'</code>. Send <code data-language="js">false</code> to disable. Send an object with <code data-language="js">get</code> and <code data-language="js">set</code> functions to customize.
 * @property {TemplateLoader} loader The method that Swig will use to load templates. Defaults to <var>swig.loaders.fs</var>.
 */
var defaultOptions = {
    autoescape: true,
    varControls: ['{{', '}}'],
    tagControls: ['{%', '%}'],
    cmtControls: ['{#', '#}'],
    locals: {},
    /**
     * Cache control for templates. Defaults to saving all templates into memory.
     * @typedef {boolean|string|object} CacheOptions
     * @example
     * // Default
     * swig.setDefaults({ cache: 'memory' });
     * @example
     * // Disables caching in Swig.
     * swig.setDefaults({ cache: false });
     * @example
     * // Custom cache storage and retrieval
     * swig.setDefaults({
     *   cache: {
     *     get: function (key) { ... },
     *     set: function (key, val) { ... }
     *   }
     * });
     */
    cache: 'memory',
    /**
     * Configure Swig to use either the <var>swig.loaders.fs</var> or <var>swig.loaders.memory</var> template loader. Or, you can write your own!
     * For more information, please see the <a href="../loaders/">Template Loaders documentation</a>.
     * @typedef {class} TemplateLoader
     * @example
     * // Default, FileSystem loader
     * swig.setDefaults({ loader: swig.loaders.fs() });
     * @example
     * // FileSystem loader allowing a base path
     * // With this, you don't use relative URLs in your template references
     * swig.setDefaults({ loader: swig.loaders.fs(__dirname + '/templates') });
     * @example
     * // Memory Loader
     * swig.setDefaults({ loader: swig.loaders.memory({
     *   layout: '{% block foo %}{% endblock %}',
     *   page1: '{% extends "layout" %}{% block foo %}Tacos!{% endblock %}'
     * })});
     */
    loader: loaders.fs()
  },
  defaultInstance;

/**
 * Empty function, used in templates.
 * @return {string} Empty string
 * @private
 */
function efn() { return ''; }

/**
 * Validate the Swig options object.
 * @param  {?SwigOpts} options Swig options object.
 * @return {undefined}      This method will throw errors if anything is wrong.
 * @private
 */
function validateOptions(options) {
  if (!options) {
    return;
  }

  utils.each(['varControls', 'tagControls', 'cmtControls'], function (key) {
    if (!options.hasOwnProperty(key)) {
      return;
    }
    if (!utils.isArray(options[key]) || options[key].length !== 2) {
      throw new Error('Option "' + key + '" must be an array containing 2 different control strings.');
    }
    if (options[key][0] === options[key][1]) {
      throw new Error('Option "' + key + '" open and close controls must not be the same.');
    }
    utils.each(options[key], function (a, i) {
      if (a.length < 2) {
        throw new Error('Option "' + key + '" ' + ((i) ? 'open ' : 'close ') + 'control must be at least 2 characters. Saw "' + a + '" instead.');
      }
    });
  });

  if (options.hasOwnProperty('cache')) {
    if (options.cache && options.cache !== 'memory') {
      if (!options.cache.get || !options.cache.set) {
        throw new Error('Invalid cache option ' + JSON.stringify(options.cache) + ' found. Expected "memory" or { get: function (key) { ... }, set: function (key, value) { ... } }.');
      }
    }
  }
  if (options.hasOwnProperty('loader')) {
    if (options.loader) {
      if (!options.loader.load || !options.loader.resolve) {
        throw new Error('Invalid loader option ' + JSON.stringify(options.loader) + ' found. Expected { load: function (pathname, cb) { ... }, resolve: function (to, from) { ... } }.');
      }
    }
  }

}

/**
 * Set defaults for the base and all new Swig environments.
 *
 * @example
 * swig.setDefaults({ cache: false });
 * // => Disables Cache
 *
 * @example
 * swig.setDefaults({ locals: { now: function () { return new Date(); } }});
 * // => sets a globally accessible method for all template
 * //    contexts, allowing you to print the current date
 * // => {{ now()|date('F jS, Y') }}
 *
 * @param  {SwigOpts} [options={}] Swig options object.
 * @return {undefined}
 */
exports.setDefaults = function (options) {
  validateOptions(options);

  var locals = utils.extend({}, defaultOptions.locals, options.locals || {});

  utils.extend(defaultOptions, options);
  defaultOptions.locals = locals;

  defaultInstance.options = utils.extend(defaultInstance.options, options);
};

/**
 * Set the default TimeZone offset for date formatting via the date filter. This is a global setting and will affect all Swig environments, old or new.
 * @param  {number} offset Offset from GMT, in minutes.
 * @return {undefined}
 */
exports.setDefaultTZOffset = function (offset) {
  dateformatter.tzOffset = offset;
};

/**
 * Create a new, separate Swig compile/render environment.
 *
 * @example
 * var swig = require('swig');
 * var myswig = new swig.Swig({varControls: ['<%=', '%>']});
 * myswig.render('Tacos are <%= tacos =>!', { locals: { tacos: 'delicious' }});
 * // => Tacos are delicious!
 * swig.render('Tacos are <%= tacos =>!', { locals: { tacos: 'delicious' }});
 * // => 'Tacos are <%= tacos =>!'
 *
 * @param  {SwigOpts} [opts={}] Swig options object.
 * @return {object}      New Swig environment.
 */
exports.Swig = function (opts) {
  validateOptions(opts);
  this.options = utils.extend({}, defaultOptions, opts || {});
  this.cache = {};
  this.extensions = {};
  var self = this,
    tags = _tags,
    filters = _filters;

  /**
   * Get combined locals context.
   * @param  {?SwigOpts} [options] Swig options object.
   * @return {object}         Locals context.
   * @private
   */
  function getLocals(options) {
    if (!options || !options.locals) {
      return self.options.locals;
    }

    return utils.extend({}, self.options.locals, options.locals);
  }

  /**
   * Get compiled template from the cache.
   * @param  {string} key           Name of template.
   * @return {object|undefined}     Template function and tokens.
   * @private
   */
  function cacheGet(key) {
    if (!self.options.cache) {
      return;
    }

    if (self.options.cache === 'memory') {
      return self.cache[key];
    }

    return self.options.cache.get(key);
  }

  /**
   * Store a template in the cache.
   * @param  {string} key Name of template.
   * @param  {object} val Template function and tokens.
   * @return {undefined}
   * @private
   */
  function cacheSet(key, val) {
    if (!self.options.cache) {
      return;
    }

    if (self.options.cache === 'memory') {
      self.cache[key] = val;
      return;
    }

    self.options.cache.set(key, val);
  }

  /**
   * Clears the in-memory template cache.
   *
   * @example
   * swig.invalidateCache();
   *
   * @return {undefined}
   */
  this.invalidateCache = function () {
    if (self.options.cache === 'memory') {
      self.cache = {};
    }
  };

  /**
   * Add a custom filter for swig variables.
   *
   * @example
   * function replaceMs(input) { return input.replace(/m/g, 'f'); }
   * swig.setFilter('replaceMs', replaceMs);
   * // => {{ "onomatopoeia"|replaceMs }}
   * // => onofatopeia
   *
   * @param {string}    name    Name of filter, used in templates. <strong>Will</strong> overwrite previously defined filters, if using the same name.
   * @param {function}  method  Function that acts against the input. See <a href="/docs/filters/#custom">Custom Filters</a> for more information.
   * @return {undefined}
   */
  this.setFilter = function (name, method) {
    if (typeof method !== "function") {
      throw new Error('Filter "' + name + '" is not a valid function.');
    }
    filters[name] = method;
  };

  /**
   * Add a custom tag. To expose your own extensions to compiled template code, see <code data-language="js">swig.setExtension</code>.
   *
   * For a more in-depth explanation of writing custom tags, see <a href="../extending/#tags">Custom Tags</a>.
   *
   * @example
   * var tacotag = require('./tacotag');
   * swig.setTag('tacos', tacotag.parse, tacotag.compile, tacotag.ends, tacotag.blockLevel);
   * // => {% tacos %}Make this be tacos.{% endtacos %}
   * // => Tacos tacos tacos tacos.
   *
   * @param  {string} name      Tag name.
   * @param  {function} parse   Method for parsing tokens.
   * @param  {function} compile Method for compiling renderable output.
   * @param  {boolean} [ends=false]     Whether or not this tag requires an <i>end</i> tag.
   * @param  {boolean} [blockLevel=false] If false, this tag will not be compiled outside of <code>block</code> tags when extending a parent template.
   * @return {undefined}
   */
  this.setTag = function (name, parse, compile, ends, blockLevel) {
    if (typeof parse !== 'function') {
      throw new Error('Tag "' + name + '" parse method is not a valid function.');
    }

    if (typeof compile !== 'function') {
      throw new Error('Tag "' + name + '" compile method is not a valid function.');
    }

    tags[name] = {
      parse: parse,
      compile: compile,
      ends: ends || false,
      block: !!blockLevel
    };
  };

  /**
   * Add extensions for custom tags. This allows any custom tag to access a globally available methods via a special globally available object, <var>_ext</var>, in templates.
   *
   * @example
   * swig.setExtension('trans', function (v) { return translate(v); });
   * function compileTrans(compiler, args, content, parent, options) {
   *   return '_output += _ext.trans(' + args[0] + ');'
   * };
   * swig.setTag('trans', parseTrans, compileTrans, true);
   *
   * @param  {string} name   Key name of the extension. Accessed via <code data-language="js">_ext[name]</code>.
   * @param  {*}      object The method, value, or object that should be available via the given name.
   * @return {undefined}
   */
  this.setExtension = function (name, object) {
    self.extensions[name] = object;
  };

  /**
   * Parse a given source string into tokens.
   *
   * @param  {string} source  Swig template source.
   * @param  {SwigOpts} [options={}] Swig options object.
   * @return {object} parsed  Template tokens object.
   * @private
   */
  this.parse = function (source, options) {
    validateOptions(options);

    var locals = getLocals(options),
      opts = {},
      k;

    for (k in options) {
      if (options.hasOwnProperty(k) && k !== 'locals') {
        opts[k] = options[k];
      }
    }

    options = utils.extend({}, self.options, opts);
    options.locals = locals;

    return parser.parse(source, options, tags, filters);
  };

  /**
   * Parse a given file into tokens.
   *
   * @param  {string} pathname  Full path to file to parse.
   * @param  {SwigOpts} [options={}]   Swig options object.
   * @return {object} parsed    Template tokens object.
   * @private
   */
  this.parseFile = function (pathname, options) {
    var src;

    if (!options) {
      options = {};
    }

    pathname = self.options.loader.resolve(pathname, options.resolveFrom);

    src = self.options.loader.load(pathname);

    if (!options.filename) {
      options = utils.extend({ filename: pathname }, options);
    }

    return self.parse(src, options);
  };

  /**
   * Re-Map blocks within a list of tokens to the template's block objects.
   * @param  {array}  tokens   List of tokens for the parent object.
   * @param  {object} template Current template that needs to be mapped to the  parent's block and token list.
   * @return {array}
   * @private
   */
  function remapBlocks(blocks, tokens) {
    return utils.map(tokens, function (token) {
      var args = token.args ? token.args.join('') : '';
      if (token.name === 'block' && blocks[args]) {
        token = blocks[args];
      }
      if (token.content && token.content.length) {
        token.content = remapBlocks(blocks, token.content);
      }
      return token;
    });
  }

  /**
   * Import block-level tags to the token list that are not actual block tags.
   * @param  {array} blocks List of block-level tags.
   * @param  {array} tokens List of tokens to render.
   * @return {undefined}
   * @private
   */
  function importNonBlocks(blocks, tokens) {
    utils.each(blocks, function (block) {
      if (block.name !== 'block') {
        tokens.unshift(block);
      }
    });
  }

  /**
   * Recursively compile and get parents of given parsed token object.
   *
   * @param  {object} tokens    Parsed tokens from template.
   * @param  {SwigOpts} [options={}]   Swig options object.
   * @return {object}           Parsed tokens from parent templates.
   * @private
   */
  function getParents(tokens, options) {
    var parentName = tokens.parent,
      parentFiles = [],
      parents = [],
      parentFile,
      parent,
      l;

    while (parentName) {
      if (!options || !options.filename) {
        throw new Error('Cannot extend "' + parentName + '" because current template has no filename.');
      }

      parentFile = parentFile || options.filename;
      parentFile = self.options.loader.resolve(parentName, parentFile);
      parent = cacheGet(parentFile) || self.parseFile(parentFile, utils.extend({}, options, { filename: parentFile }));
      parentName = parent.parent;

      if (parentFiles.indexOf(parentFile) !== -1) {
        throw new Error('Illegal circular extends of "' + parentFile + '".');
      }
      parentFiles.push(parentFile);

      parents.push(parent);
    }

    // Remap each parents'(1) blocks onto its own parent(2), receiving the full token list for rendering the original parent(1) on its own.
    l = parents.length;
    for (l = parents.length - 2; l >= 0; l -= 1) {
      parents[l].tokens = remapBlocks(parents[l].blocks, parents[l + 1].tokens);
      importNonBlocks(parents[l].blocks, parents[l].tokens);
    }

    return parents;
  }

  /**
   * Pre-compile a source string into a cache-able template function.
   *
   * @example
   * swig.precompile('{{ tacos }}');
   * // => {
   * //      tpl: function (_swig, _locals, _filters, _utils, _fn) { ... },
   * //      tokens: {
   * //        name: undefined,
   * //        parent: null,
   * //        tokens: [...],
   * //        blocks: {}
   * //      }
   * //    }
   *
   * In order to render a pre-compiled template, you must have access to filters and utils from Swig. <var>efn</var> is simply an empty function that does nothing.
   *
   * @param  {string} source  Swig template source string.
   * @param  {SwigOpts} [options={}] Swig options object.
   * @return {object}         Renderable function and tokens object.
   */
  this.precompile = function (source, options) {
    var tokens = self.parse(source, options),
      parents = getParents(tokens, options),
      tpl;

    if (parents.length) {
      // Remap the templates first-parent's tokens using this template's blocks.
      tokens.tokens = remapBlocks(tokens.blocks, parents[0].tokens);
      importNonBlocks(tokens.blocks, tokens.tokens);
    }

    tpl = new Function('_swig', '_ctx', '_filters', '_utils', '_fn',
      '  var _ext = _swig.extensions,\n' +
      '    _output = "";\n' +
      parser.compile(tokens, parents, options) + '\n' +
      '  return _output;\n'
      );

    return { tpl: tpl, tokens: tokens };
  };

  /**
   * Compile and render a template string for final output.
   *
   * When rendering a source string, a file path should be specified in the options object in order for <var>extends</var>, <var>include</var>, and <var>import</var> to work properly. Do this by adding <code data-language="js">{ filename: '/absolute/path/to/mytpl.html' }</code> to the options argument.
   *
   * @example
   * swig.render('{{ tacos }}', { locals: { tacos: 'Tacos!!!!' }});
   * // => Tacos!!!!
   *
   * @param  {string} source    Swig template source string.
   * @param  {SwigOpts} [options={}] Swig options object.
   * @return {string}           Rendered output.
   */
  this.render = function (source, options) {
    return self.compile(source, options)();
  };

  /**
   * Compile and render a template file for final output. This is most useful for libraries like Express.js.
   *
   * @example
   * swig.renderFile('./template.html', {}, function (err, output) {
   *   if (err) {
   *     throw err;
   *   }
   *   console.log(output);
   * });
   *
   * @example
   * swig.renderFile('./template.html', {});
   * // => output
   *
   * @param  {string}   pathName    File location.
   * @param  {object}   [locals={}] Template variable context.
   * @param  {Function} [cb] Asyncronous callback function. If not provided, <var>compileFile</var> will run syncronously.
   * @return {string}             Rendered output.
   */
  this.renderFile = function (pathName, locals, cb) {
    if (cb) {
      self.compileFile(pathName, {}, function (err, fn) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, fn(locals));
      });
      return;
    }

    return self.compileFile(pathName)(locals);
  };

  /**
   * Compile string source into a renderable template function.
   *
   * @example
   * var tpl = swig.compile('{{ tacos }}');
   * // => {
   * //      [Function: compiled]
   * //      parent: null,
   * //      tokens: [{ compile: [Function] }],
   * //      blocks: {}
   * //    }
   * tpl({ tacos: 'Tacos!!!!' });
   * // => Tacos!!!!
   *
   * When compiling a source string, a file path should be specified in the options object in order for <var>extends</var>, <var>include</var>, and <var>import</var> to work properly. Do this by adding <code data-language="js">{ filename: '/absolute/path/to/mytpl.html' }</code> to the options argument.
   *
   * @param  {string} source    Swig template source string.
   * @param  {SwigOpts} [options={}] Swig options object.
   * @return {function}         Renderable function with keys for parent, blocks, and tokens.
   */
  this.compile = function (source, options) {
    var key = options ? options.filename : null,
      cached = key ? cacheGet(key) : null,
      context,
      contextLength,
      pre;

    if (cached) {
      return cached;
    }

    context = getLocals(options);
    contextLength = utils.keys(context).length;
    pre = this.precompile(source, options);

    function compiled(locals) {
      var lcls;
      if (locals && contextLength) {
        lcls = utils.extend({}, context, locals);
      } else if (locals && !contextLength) {
        lcls = locals;
      } else if (!locals && contextLength) {
        lcls = context;
      } else {
        lcls = {};
      }
      return pre.tpl(self, lcls, filters, utils, efn);
    }

    utils.extend(compiled, pre.tokens);

    if (key) {
      cacheSet(key, compiled);
    }

    return compiled;
  };

  /**
   * Compile a source file into a renderable template function.
   *
   * @example
   * var tpl = swig.compileFile('./mytpl.html');
   * // => {
   * //      [Function: compiled]
   * //      parent: null,
   * //      tokens: [{ compile: [Function] }],
   * //      blocks: {}
   * //    }
   * tpl({ tacos: 'Tacos!!!!' });
   * // => Tacos!!!!
   *
   * @example
   * swig.compileFile('/myfile.txt', { varControls: ['<%=', '=%>'], tagControls: ['<%', '%>']});
   * // => will compile 'myfile.txt' using the var and tag controls as specified.
   *
   * @param  {string} pathname  File location.
   * @param  {SwigOpts} [options={}] Swig options object.
   * @param  {Function} [cb] Asyncronous callback function. If not provided, <var>compileFile</var> will run syncronously.
   * @return {function}         Renderable function with keys for parent, blocks, and tokens.
   */
  this.compileFile = function (pathname, options, cb) {
    var src, cached;

    if (!options) {
      options = {};
    }

    pathname = self.options.loader.resolve(pathname, options.resolveFrom);
    if (!options.filename) {
      options = utils.extend({ filename: pathname }, options);
    }
    cached = cacheGet(pathname);

    if (cached) {
      if (cb) {
        cb(null, cached);
        return;
      }
      return cached;
    }

    if (cb) {
      self.options.loader.load(pathname, function (err, src) {
        if (err) {
          cb(err);
          return;
        }
        var compiled;

        try {
          compiled = self.compile(src, options);
        } catch (err2) {
          cb(err2);
          return;
        }

        cb(err, compiled);
      });
      return;
    }

    src = self.options.loader.load(pathname);
    return self.compile(src, options);
  };

  /**
   * Run a pre-compiled template function. This is most useful in the browser when you've pre-compiled your templates with the Swig command-line tool.
   *
   * @example
   * $ swig compile ./mytpl.html --wrap-start="var mytpl = " > mytpl.js
   * @example
   * <script src="mytpl.js"></script>
   * <script>
   *   swig.run(mytpl, {});
   *   // => "rendered template..."
   * </script>
   *
   * @param  {function} tpl       Pre-compiled Swig template function. Use the Swig CLI to compile your templates.
   * @param  {object} [locals={}] Template variable context.
   * @param  {string} [filepath]  Filename used for caching the template.
   * @return {string}             Rendered output.
   */
  this.run = function (tpl, locals, filepath) {
    var context = getLocals({ locals: locals });
    if (filepath) {
      cacheSet(filepath, tpl);
    }
    return tpl(self, context, filters, utils, efn);
  };
};

/*!
 * Export methods publicly
 */
defaultInstance = new exports.Swig();
exports.setFilter = defaultInstance.setFilter;
exports.setTag = defaultInstance.setTag;
exports.setExtension = defaultInstance.setExtension;
exports.parseFile = defaultInstance.parseFile;
exports.precompile = defaultInstance.precompile;
exports.compile = defaultInstance.compile;
exports.compileFile = defaultInstance.compileFile;
exports.render = defaultInstance.render;
exports.renderFile = defaultInstance.renderFile;
exports.run = defaultInstance.run;
exports.invalidateCache = defaultInstance.invalidateCache;
exports.loaders = loaders;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/swig.js","/../../node_modules/swig/lib")
},{"./dateformatter":8,"./filters":9,"./loaders":12,"./parser":14,"./tags":26,"./utils":32,"buffer":2,"oMfpAn":6}],16:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('../utils'),
  strings = ['html', 'js'];

/**
 * Control auto-escaping of variable output from within your templates.
 *
 * @alias autoescape
 *
 * @example
 * // myvar = '<foo>';
 * {% autoescape true %}{{ myvar }}{% endautoescape %}
 * // => &lt;foo&gt;
 * {% autoescape false %}{{ myvar }}{% endautoescape %}
 * // => <foo>
 *
 * @param {boolean|string} control One of `true`, `false`, `"js"` or `"html"`.
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  return compiler(content, parents, options, blockName);
};
exports.parse = function (str, line, parser, types, stack, opts) {
  var matched;
  parser.on('*', function (token) {
    if (!matched &&
        (token.type === types.BOOL ||
          (token.type === types.STRING && strings.indexOf(token.match) === -1))
        ) {
      this.out.push(token.match);
      matched = true;
      return;
    }
    utils.throwError('Unexpected token "' + token.match + '" in autoescape tag', line, opts.filename);
  });

  return true;
};
exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/autoescape.js","/../../node_modules/swig/lib/tags")
},{"../utils":32,"buffer":2,"oMfpAn":6}],17:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Defines a block in a template that can be overridden by a template extending this one and/or will override the current template's parent template block of the same name.
 *
 * See <a href="#inheritance">Template Inheritance</a> for more information.
 *
 * @alias block
 *
 * @example
 * {% block body %}...{% endblock %}
 *
 * @param {literal}  name   Name of the block for use in parent and extended templates.
 */
exports.compile = function (compiler, args, content, parents, options) {
  return compiler(content, parents, options, args.join(''));
};

exports.parse = function (str, line, parser) {
  parser.on('*', function (token) {
    this.out.push(token.match);
  });
  return true;
};

exports.ends = true;
exports.block = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/block.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],18:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Used within an <code data-language="swig">{% if %}</code> tag, the code block following this tag up until <code data-language="swig">{% endif %}</code> will be rendered if the <i>if</i> statement returns false.
 *
 * @alias else
 *
 * @example
 * {% if false %}
 *   statement1
 * {% else %}
 *   statement2
 * {% endif %}
 * // => statement2
 *
 */
exports.compile = function () {
  return '} else {\n';
};

exports.parse = function (str, line, parser, types, stack) {
  parser.on('*', function (token) {
    throw new Error('"else" tag does not accept any tokens. Found "' + token.match + '" on line ' + line + '.');
  });

  return (stack.length && stack[stack.length - 1].name === 'if');
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/else.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],19:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var ifparser = require('./if').parse;

/**
 * Like <code data-language="swig">{% else %}</code>, except this tag can take more conditional statements.
 *
 * @alias elseif
 * @alias elif
 *
 * @example
 * {% if false %}
 *   Tacos
 * {% elseif true %}
 *   Burritos
 * {% else %}
 *   Churros
 * {% endif %}
 * // => Burritos
 *
 * @param {...mixed} conditional  Conditional statement that returns a truthy or falsy value.
 */
exports.compile = function (compiler, args) {
  return '} else if (' + args.join(' ') + ') {\n';
};

exports.parse = function (str, line, parser, types, stack) {
  var okay = ifparser(str, line, parser, types, stack);
  return okay && (stack.length && stack[stack.length - 1].name === 'if');
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/elseif.js","/../../node_modules/swig/lib/tags")
},{"./if":23,"buffer":2,"oMfpAn":6}],20:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Makes the current template extend a parent template. This tag must be the first item in your template.
 *
 * See <a href="#inheritance">Template Inheritance</a> for more information.
 *
 * @alias extends
 *
 * @example
 * {% extends "./layout.html" %}
 *
 * @param {string} parentFile  Relative path to the file that this template extends.
 */
exports.compile = function () {};

exports.parse = function () {
  return true;
};

exports.ends = false;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/extends.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],21:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var filters = require('../filters');

/**
 * Apply a filter to an entire block of template.
 *
 * @alias filter
 *
 * @example
 * {% filter uppercase %}oh hi, {{ name }}{% endfilter %}
 * // => OH HI, PAUL
 *
 * @example
 * {% filter replace(".", "!", "g") %}Hi. My name is Paul.{% endfilter %}
 * // => Hi! My name is Paul!
 *
 * @param {function} filter  The filter that should be applied to the contents of the tag.
 */

exports.compile = function (compiler, args, content, parents, options, blockName) {
  var filter = args.shift().replace(/\($/, ''),
    val = '(function () {\n' +
      '  var _output = "";\n' +
      compiler(content, parents, options, blockName) +
      '  return _output;\n' +
      '})()';

  if (args[args.length - 1] === ')') {
    args.pop();
  }

  args = (args.length) ? ', ' + args.join('') : '';
  return '_output += _filters["' + filter + '"](' + val + args + ');\n';
};

exports.parse = function (str, line, parser, types) {
  var filter;

  function check(filter) {
    if (!filters.hasOwnProperty(filter)) {
      throw new Error('Filter "' + filter + '" does not exist on line ' + line + '.');
    }
  }

  parser.on(types.FUNCTION, function (token) {
    if (!filter) {
      filter = token.match.replace(/\($/, '');
      check(filter);
      this.out.push(token.match);
      this.state.push(token.type);
      return;
    }
    return true;
  });

  parser.on(types.VAR, function (token) {
    if (!filter) {
      filter = token.match;
      check(filter);
      this.out.push(filter);
      return;
    }
    return true;
  });

  return true;
};

exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/filter.js","/../../node_modules/swig/lib/tags")
},{"../filters":9,"buffer":2,"oMfpAn":6}],22:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var ctx = '_ctx.',
  ctxloop = ctx + 'loop',
  ctxloopcache = ctx + '___loopcache';

/**
 * Loop over objects and arrays.
 *
 * @alias for
 *
 * @example
 * // obj = { one: 'hi', two: 'bye' };
 * {% for x in obj %}
 *   {% if loop.first %}<ul>{% endif %}
 *   <li>{{ loop.index }} - {{ loop.key }}: {{ x }}</li>
 *   {% if loop.last %}</ul>{% endif %}
 * {% endfor %}
 * // => <ul>
 * //    <li>1 - one: hi</li>
 * //    <li>2 - two: bye</li>
 * //    </ul>
 *
 * @example
 * // arr = [1, 2, 3]
 * // Reverse the array, shortcut the key/index to `key`
 * {% for key, val in arr|reverse %}
 * {{ key }} -- {{ val }}
 * {% endfor %}
 * // => 0 -- 3
 * //    1 -- 2
 * //    2 -- 1
 *
 * @param {literal} [key]     A shortcut to the index of the array or current key accessor.
 * @param {literal} variable  The current value will be assigned to this variable name temporarily. The variable will be reset upon ending the for tag.
 * @param {literal} in        Literally, "in". This token is required.
 * @param {object}  object    An enumerable object that will be iterated over.
 *
 * @return {loop.index} The current iteration of the loop (1-indexed)
 * @return {loop.index0} The current iteration of the loop (0-indexed)
 * @return {loop.revindex} The number of iterations from the end of the loop (1-indexed)
 * @return {loop.revindex0} The number of iterations from the end of the loop (0-indexed)
 * @return {loop.key} If the iterator is an object, this will be the key of the current item, otherwise it will be the same as the loop.index.
 * @return {loop.first} True if the current object is the first in the object or array.
 * @return {loop.last} True if the current object is the last in the object or array.
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  var val = args.shift(),
    key = '__k',
    last;

  if (args[0] && args[0] === ',') {
    args.shift();
    key = val;
    val = args.shift();
  }

  last = args.join('');

  return [
    '(function () {\n',
    '  var __l = ' + last + ', __len = (_utils.isArray(__l)) ? __l.length : _utils.keys(__l).length;\n',
    '  if (!__l) { return; }\n',
    '  ' + ctxloopcache + ' = { loop: ' + ctxloop + ', ' + val + ': ' + ctx + val + ', ' + key + ': ' + ctx + key + ' };\n',
    '  ' + ctxloop + ' = { first: false, index: 1, index0: 0, revindex: __len, revindex0: __len - 1, length: __len, last: false };\n',
    '  _utils.each(__l, function (' + val + ', ' + key + ') {\n',
    '    ' + ctx + val + ' = ' + val + ';\n',
    '    ' + ctx + key + ' = ' + key + ';\n',
    '    ' + ctxloop + '.key = ' + key + ';\n',
    '    ' + ctxloop + '.first = (' + ctxloop + '.index0 === 0);\n',
    '    ' + ctxloop + '.last = (' + ctxloop + '.revindex0 === 0);\n',
    '    ' + compiler(content, parents, options, blockName),
    '    ' + ctxloop + '.index += 1; ' + ctxloop + '.index0 += 1; ' + ctxloop + '.revindex -= 1; ' + ctxloop + '.revindex0 -= 1;\n',
    '  });\n',
    '  ' + ctxloop + ' = ' + ctxloopcache + '.loop;\n',
    '  ' + ctx + val + ' = ' + ctxloopcache + '.' + val + ';\n',
    '  ' + ctx + key + ' = ' + ctxloopcache + '.' + key + ';\n',
    '})();\n'
  ].join('');
};

exports.parse = function (str, line, parser, types) {
  var firstVar, ready;

  parser.on(types.NUMBER, function (token) {
    var lastState = this.state.length ? this.state[this.state.length - 1] : null;
    if (!ready ||
        (lastState !== types.ARRAYOPEN &&
          lastState !== types.CURLYOPEN &&
          lastState !== types.CURLYCLOSE &&
          lastState !== types.FUNCTION &&
          lastState !== types.FILTER)
        ) {
      throw new Error('Unexpected number "' + token.match + '" on line ' + line + '.');
    }
    return true;
  });

  parser.on(types.VAR, function (token) {
    if (ready && firstVar) {
      return true;
    }

    if (!this.out.length) {
      firstVar = true;
    }

    this.out.push(token.match);
  });

  parser.on(types.COMMA, function (token) {
    if (firstVar && this.prevToken.type === types.VAR) {
      this.out.push(token.match);
      return;
    }

    return true;
  });

  parser.on(types.COMPARATOR, function (token) {
    if (token.match !== 'in' || !firstVar) {
      throw new Error('Unexpected token "' + token.match + '" on line ' + line + '.');
    }
    ready = true;
  });

  return true;
};

exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/for.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],23:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Used to create conditional statements in templates. Accepts most JavaScript valid comparisons.
 *
 * Can be used in conjunction with <a href="#elseif"><code data-language="swig">{% elseif ... %}</code></a> and <a href="#else"><code data-language="swig">{% else %}</code></a> tags.
 *
 * @alias if
 *
 * @example
 * {% if x %}{% endif %}
 * {% if !x %}{% endif %}
 * {% if not x %}{% endif %}
 *
 * @example
 * {% if x and y %}{% endif %}
 * {% if x && y %}{% endif %}
 * {% if x or y %}{% endif %}
 * {% if x || y %}{% endif %}
 * {% if x || (y && z) %}{% endif %}
 *
 * @example
 * {% if x [operator] y %}
 *   Operators: ==, !=, <, <=, >, >=, ===, !==
 * {% endif %}
 *
 * @example
 * {% if x == 'five' %}
 *   The operands can be also be string or number literals
 * {% endif %}
 *
 * @example
 * {% if x|lower === 'tacos' %}
 *   You can use filters on any operand in the statement.
 * {% endif %}
 *
 * @example
 * {% if x in y %}
 *   If x is a value that is present in y, this will return true.
 * {% endif %}
 *
 * @param {...mixed} conditional Conditional statement that returns a truthy or falsy value.
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  return 'if (' + args.join(' ') + ') { \n' +
    compiler(content, parents, options, blockName) + '\n' +
    '}';
};

exports.parse = function (str, line, parser, types) {
  parser.on(types.COMPARATOR, function (token) {
    if (this.isLast) {
      throw new Error('Unexpected logic "' + token.match + '" on line ' + line + '.');
    }
    if (this.prevToken.type === types.NOT) {
      throw new Error('Attempted logic "not ' + token.match + '" on line ' + line + '. Use !(foo ' + token.match + ') instead.');
    }
    this.out.push(token.match);
  });

  parser.on(types.NOT, function (token) {
    if (this.isLast) {
      throw new Error('Unexpected logic "' + token.match + '" on line ' + line + '.');
    }
    this.out.push(token.match);
  });

  parser.on(types.BOOL, function (token) {
    this.out.push(token.match);
  });

  parser.on(types.LOGIC, function (token) {
    if (!this.out.length || this.isLast) {
      throw new Error('Unexpected logic "' + token.match + '" on line ' + line + '.');
    }
    this.out.push(token.match);
    this.filterApplyIdx.pop();
  });

  return true;
};

exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/if.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],24:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('../utils');

/**
 * Allows you to import macros from another file directly into your current context.
 * The import tag is specifically designed for importing macros into your template with a specific context scope. This is very useful for keeping your macros from overriding template context that is being injected by your server-side page generation.
 *
 * @alias import
 *
 * @example
 * {% import './formmacros.html' as forms %}
 * {{ form.input("text", "name") }}
 * // => <input type="text" name="name">
 *
 * @example
 * {% import "../shared/tags.html" as tags %}
 * {{ tags.stylesheet('global') }}
 * // => <link rel="stylesheet" href="/global.css">
 *
 * @param {string|var}  file      Relative path from the current template file to the file to import macros from.
 * @param {literal}     as        Literally, "as".
 * @param {literal}     varname   Local-accessible object name to assign the macros to.
 */
exports.compile = function (compiler, args) {
  var ctx = args.pop(),
    out = '_ctx.' + ctx + ' = {};\n  var _output = "";\n',
    replacements = utils.map(args, function (arg) {
      return {
        ex: new RegExp('_ctx.' + arg.name, 'g'),
        re: '_ctx.' + ctx + '.' + arg.name
      };
    });

  // Replace all occurrences of all macros in this file with
  // proper namespaced definitions and calls
  utils.each(args, function (arg) {
    var c = arg.compiled;
    utils.each(replacements, function (re) {
      c = c.replace(re.ex, re.re);
    });
    out += c;
  });

  return out;
};

exports.parse = function (str, line, parser, types, stack, opts) {
  var parseFile = require('../swig').parseFile,
    compiler = require('../parser').compile,
    parseOpts = { resolveFrom: opts.filename },
    compileOpts = utils.extend({}, opts, parseOpts),
    tokens,
    ctx;

  parser.on(types.STRING, function (token) {
    var self = this;
    if (!tokens) {
      tokens = parseFile(token.match.replace(/^("|')|("|')$/g, ''), parseOpts).tokens;
      utils.each(tokens, function (token) {
        var out = '',
          macroName;
        if (!token || token.name !== 'macro' || !token.compile) {
          return;
        }
        macroName = token.args[0];
        out += token.compile(compiler, token.args, token.content, [], compileOpts) + '\n';
        self.out.push({compiled: out, name: macroName});
      });
      return;
    }

    throw new Error('Unexpected string ' + token.match + ' on line ' + line + '.');
  });

  parser.on(types.VAR, function (token) {
    var self = this;
    if (!tokens || ctx) {
      throw new Error('Unexpected variable "' + token.match + '" on line ' + line + '.');
    }

    if (token.match === 'as') {
      return;
    }

    ctx = token.match;
    self.out.push(ctx);
    return false;
  });

  return true;
};

exports.block = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/import.js","/../../node_modules/swig/lib/tags")
},{"../parser":14,"../swig":15,"../utils":32,"buffer":2,"oMfpAn":6}],25:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var ignore = 'ignore',
  missing = 'missing',
  only = 'only';

/**
 * Includes a template partial in place. The template is rendered within the current locals variable context.
 *
 * @alias include
 *
 * @example
 * // food = 'burritos';
 * // drink = 'lemonade';
 * {% include "./partial.html" %}
 * // => I like burritos and lemonade.
 *
 * @example
 * // my_obj = { food: 'tacos', drink: 'horchata' };
 * {% include "./partial.html" with my_obj only %}
 * // => I like tacos and horchata.
 *
 * @example
 * {% include "/this/file/does/not/exist" ignore missing %}
 * // => (Nothing! empty string)
 *
 * @param {string|var}  file      The path, relative to the template root, to render into the current context.
 * @param {literal}     [with]    Literally, "with".
 * @param {object}      [context] Local variable key-value object context to provide to the included file.
 * @param {literal}     [only]    Restricts to <strong>only</strong> passing the <code>with context</code> as local variables–the included template will not be aware of any other local variables in the parent template. For best performance, usage of this option is recommended if possible.
 * @param {literal}     [ignore missing] Will output empty string if not found instead of throwing an error.
 */
exports.compile = function (compiler, args) {
  var file = args.shift(),
    onlyIdx = args.indexOf(only),
    onlyCtx = onlyIdx !== -1 ? args.splice(onlyIdx, 1) : false,
    parentFile = (args.pop() || '').replace(/\\/g, '\\\\'),
    ignore = args[args.length - 1] === missing ? (args.pop()) : false,
    w = args.join('');

  return (ignore ? '  try {\n' : '') +
    '_output += _swig.compileFile(' + file + ', {' +
    'resolveFrom: "' + parentFile + '"' +
    '})(' +
    ((onlyCtx && w) ? w : (!w ? '_ctx' : '_utils.extend({}, _ctx, ' + w + ')')) +
    ');\n' +
    (ignore ? '} catch (e) {}\n' : '');
};

exports.parse = function (str, line, parser, types, stack, opts) {
  var file, w;
  parser.on(types.STRING, function (token) {
    if (!file) {
      file = token.match;
      this.out.push(file);
      return;
    }

    return true;
  });

  parser.on(types.VAR, function (token) {
    if (!file) {
      file = token.match;
      return true;
    }

    if (!w && token.match === 'with') {
      w = true;
      return;
    }

    if (w && token.match === only && this.prevToken.match !== 'with') {
      this.out.push(token.match);
      return;
    }

    if (token.match === ignore) {
      return false;
    }

    if (token.match === missing) {
      if (this.prevToken.match !== ignore) {
        throw new Error('Unexpected token "' + missing + '" on line ' + line + '.');
      }
      this.out.push(token.match);
      return false;
    }

    if (this.prevToken.match === ignore) {
      throw new Error('Expected "' + missing + '" on line ' + line + ' but found "' + token.match + '".');
    }

    return true;
  });

  parser.on('end', function () {
    this.out.push(opts.filename || null);
  });

  return true;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/include.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],26:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.autoescape = require('./autoescape');
exports.block = require('./block');
exports["else"] = require('./else');
exports.elseif = require('./elseif');
exports.elif = exports.elseif;
exports["extends"] = require('./extends');
exports.filter = require('./filter');
exports["for"] = require('./for');
exports["if"] = require('./if');
exports["import"] = require('./import');
exports.include = require('./include');
exports.macro = require('./macro');
exports.parent = require('./parent');
exports.raw = require('./raw');
exports.set = require('./set');
exports.spaceless = require('./spaceless');

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/index.js","/../../node_modules/swig/lib/tags")
},{"./autoescape":16,"./block":17,"./else":18,"./elseif":19,"./extends":20,"./filter":21,"./for":22,"./if":23,"./import":24,"./include":25,"./macro":27,"./parent":28,"./raw":29,"./set":30,"./spaceless":31,"buffer":2,"oMfpAn":6}],27:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Create custom, reusable snippets within your templates.
 * Can be imported from one template to another using the <a href="#import"><code data-language="swig">{% import ... %}</code></a> tag.
 *
 * @alias macro
 *
 * @example
 * {% macro input(type, name, id, label, value, error) %}
 *   <label for="{{ name }}">{{ label }}</label>
 *   <input type="{{ type }}" name="{{ name }}" id="{{ id }}" value="{{ value }}"{% if error %} class="error"{% endif %}>
 * {% endmacro %}
 *
 * {{ input("text", "fname", "fname", "First Name", fname.value, fname.errors) }}
 * // => <label for="fname">First Name</label>
 * //    <input type="text" name="fname" id="fname" value="">
 *
 * @param {...arguments} arguments  User-defined arguments.
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  var fnName = args.shift();

  return '_ctx.' + fnName + ' = function (' + args.join('') + ') {\n' +
    '  var _output = "";\n' +
    compiler(content, parents, options, blockName) + '\n' +
    '  return _output;\n' +
    '};\n' +
    '_ctx.' + fnName + '.safe = true;\n';
};

exports.parse = function (str, line, parser, types) {
  var name;

  parser.on(types.VAR, function (token) {
    if (token.match.indexOf('.') !== -1) {
      throw new Error('Unexpected dot in macro argument "' + token.match + '" on line ' + line + '.');
    }
    this.out.push(token.match);
  });

  parser.on(types.FUNCTION, function (token) {
    if (!name) {
      name = token.match;
      this.out.push(name);
      this.state.push(types.FUNCTION);
    }
  });

  parser.on(types.FUNCTIONEMPTY, function (token) {
    if (!name) {
      name = token.match;
      this.out.push(name);
    }
  });

  parser.on(types.PARENCLOSE, function () {
    if (this.isLast) {
      return;
    }
    throw new Error('Unexpected parenthesis close on line ' + line + '.');
  });

  parser.on(types.COMMA, function () {
    return true;
  });

  parser.on('*', function () {
    return;
  });

  return true;
};

exports.ends = true;
exports.block = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/macro.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],28:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Inject the content from the parent template's block of the same name into the current block.
 *
 * See <a href="#inheritance">Template Inheritance</a> for more information.
 *
 * @alias parent
 *
 * @example
 * {% extends "./foo.html" %}
 * {% block content %}
 *   My content.
 *   {% parent %}
 * {% endblock %}
 *
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  if (!parents || !parents.length) {
    return '';
  }

  var parentFile = args[0],
    breaker = true,
    l = parents.length,
    i = 0,
    parent,
    block;

  for (i; i < l; i += 1) {
    parent = parents[i];
    if (!parent.blocks || !parent.blocks.hasOwnProperty(blockName)) {
      continue;
    }
    // Silly JSLint "Strange Loop" requires return to be in a conditional
    if (breaker && parentFile !== parent.name) {
      block = parent.blocks[blockName];
      return block.compile(compiler, [blockName], block.content, parents.slice(i + 1), options) + '\n';
    }
  }
};

exports.parse = function (str, line, parser, types, stack, opts) {
  parser.on('*', function (token) {
    throw new Error('Unexpected argument "' + token.match + '" on line ' + line + '.');
  });

  parser.on('end', function () {
    this.out.push(opts.filename);
  });

  return true;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/parent.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],29:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// Magic tag, hardcoded into parser

/**
 * Forces the content to not be auto-escaped. All swig instructions will be ignored and the content will be rendered exactly as it was given.
 *
 * @alias raw
 *
 * @example
 * // foobar = '<p>'
 * {% raw %}{{ foobar }}{% endraw %}
 * // => {{ foobar }}
 *
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  return compiler(content, parents, options, blockName);
};
exports.parse = function (str, line, parser) {
  parser.on('*', function (token) {
    throw new Error('Unexpected token "' + token.match + '" in raw tag on line ' + line + '.');
  });
  return true;
};
exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/raw.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],30:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * Set a variable for re-use in the current context. This will over-write any value already set to the context for the given <var>varname</var>.
 *
 * @alias set
 *
 * @example
 * {% set foo = "anything!" %}
 * {{ foo }}
 * // => anything!
 *
 * @example
 * // index = 2;
 * {% set bar = 1 %}
 * {% set bar += index|default(3) %}
 * // => 3
 *
 * @example
 * // foods = {};
 * // food = 'chili';
 * {% set foods[food] = "con queso" %}
 * {{ foods.chili }}
 * // => con queso
 *
 * @example
 * // foods = { chili: 'chili con queso' }
 * {% set foods.chili = "guatamalan insanity pepper" %}
 * {{ foods.chili }}
 * // => guatamalan insanity pepper
 *
 * @param {literal} varname   The variable name to assign the value to.
 * @param {literal} assignement   Any valid JavaScript assignement. <code data-language="js">=, +=, *=, /=, -=</code>
 * @param {*}   value     Valid variable output.
 */
exports.compile = function (compiler, args) {
  return args.join(' ') + ';\n';
};

exports.parse = function (str, line, parser, types) {
  var nameSet = '',
    propertyName;

  parser.on(types.VAR, function (token) {
    if (propertyName) {
      // Tell the parser where to find the variable
      propertyName += '_ctx.' + token.match;
      return;
    }

    if (!parser.out.length) {
      nameSet += token.match;
      return;
    }

    return true;
  });

  parser.on(types.BRACKETOPEN, function (token) {
    if (!propertyName && !this.out.length) {
      propertyName = token.match;
      return;
    }

    return true;
  });

  parser.on(types.STRING, function (token) {
    if (propertyName && !this.out.length) {
      propertyName += token.match;
      return;
    }

    return true;
  });

  parser.on(types.BRACKETCLOSE, function (token) {
    if (propertyName && !this.out.length) {
      nameSet += propertyName + token.match;
      propertyName = undefined;
      return;
    }

    return true;
  });

  parser.on(types.DOTKEY, function (token) {
    if (!propertyName && !nameSet) {
      return true;
    }
    nameSet += '.' + token.match;
    return;
  });

  parser.on(types.ASSIGNMENT, function (token) {
    if (this.out.length || !nameSet) {
      throw new Error('Unexpected assignment "' + token.match + '" on line ' + line + '.');
    }

    this.out.push(
      // Prevent the set from spilling into global scope
      '_ctx.' + nameSet
    );
    this.out.push(token.match);
  });

  return true;
};

exports.block = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/set.js","/../../node_modules/swig/lib/tags")
},{"buffer":2,"oMfpAn":6}],31:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var utils = require('../utils');

/**
 * Attempts to remove whitespace between HTML tags. Use at your own risk.
 *
 * @alias spaceless
 *
 * @example
 * {% spaceless %}
 *   {% for num in foo %}
 *   <li>{{ loop.index }}</li>
 *   {% endfor %}
 * {% endspaceless %}
 * // => <li>1</li><li>2</li><li>3</li>
 *
 */
exports.compile = function (compiler, args, content, parents, options, blockName) {
  function stripWhitespace(tokens) {
    return utils.map(tokens, function (token) {
      if (token.content || typeof token !== 'string') {
        token.content = stripWhitespace(token.content);
        return token;
      }

      return token.replace(/^\s+/, '')
        .replace(/>\s+</g, '><')
        .replace(/\s+$/, '');
    });
  }

  return compiler(stripWhitespace(content), parents, options, blockName);
};

exports.parse = function (str, line, parser) {
  parser.on('*', function (token) {
    throw new Error('Unexpected token "' + token.match + '" on line ' + line + '.');
  });

  return true;
};

exports.ends = true;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/tags/spaceless.js","/../../node_modules/swig/lib/tags")
},{"../utils":32,"buffer":2,"oMfpAn":6}],32:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var isArray;

/**
 * Strip leading and trailing whitespace from a string.
 * @param  {string} input
 * @return {string}       Stripped input.
 */
exports.strip = function (input) {
  return input.replace(/^\s+|\s+$/g, '');
};

/**
 * Test if a string starts with a given prefix.
 * @param  {string} str    String to test against.
 * @param  {string} prefix Prefix to check for.
 * @return {boolean}
 */
exports.startsWith = function (str, prefix) {
  return str.indexOf(prefix) === 0;
};

/**
 * Test if a string ends with a given suffix.
 * @param  {string} str    String to test against.
 * @param  {string} suffix Suffix to check for.
 * @return {boolean}
 */
exports.endsWith = function (str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

/**
 * Iterate over an array or object.
 * @param  {array|object} obj Enumerable object.
 * @param  {Function}     fn  Callback function executed for each item.
 * @return {array|object}     The original input object.
 */
exports.each = function (obj, fn) {
  var i, l;

  if (isArray(obj)) {
    i = 0;
    l = obj.length;
    for (i; i < l; i += 1) {
      if (fn(obj[i], i, obj) === false) {
        break;
      }
    }
  } else {
    for (i in obj) {
      if (obj.hasOwnProperty(i)) {
        if (fn(obj[i], i, obj) === false) {
          break;
        }
      }
    }
  }

  return obj;
};

/**
 * Test if an object is an Array.
 * @param {object} obj
 * @return {boolean}
 */
exports.isArray = isArray = (Array.hasOwnProperty('isArray')) ? Array.isArray : function (obj) {
  return (obj) ? (typeof obj === 'object' && Object.prototype.toString.call(obj).indexOf() !== -1) : false;
};

/**
 * Test if an item in an enumerable matches your conditions.
 * @param  {array|object}   obj   Enumerable object.
 * @param  {Function}       fn    Executed for each item. Return true if your condition is met.
 * @return {boolean}
 */
exports.some = function (obj, fn) {
  var i = 0,
    result,
    l;
  if (isArray(obj)) {
    l = obj.length;

    for (i; i < l; i += 1) {
      result = fn(obj[i], i, obj);
      if (result) {
        break;
      }
    }
  } else {
    exports.each(obj, function (value, index) {
      result = fn(value, index, obj);
      return !(result);
    });
  }
  return !!result;
};

/**
 * Return a new enumerable, mapped by a given iteration function.
 * @param  {object}   obj Enumerable object.
 * @param  {Function} fn  Executed for each item. Return the item to replace the original item with.
 * @return {object}       New mapped object.
 */
exports.map = function (obj, fn) {
  var i = 0,
    result = [],
    l;

  if (isArray(obj)) {
    l = obj.length;
    for (i; i < l; i += 1) {
      result[i] = fn(obj[i], i);
    }
  } else {
    for (i in obj) {
      if (obj.hasOwnProperty(i)) {
        result[i] = fn(obj[i], i);
      }
    }
  }
  return result;
};

/**
 * Copy all of the properties in the source objects over to the destination object, and return the destination object. It's in-order, so the last source will override properties of the same name in previous arguments.
 * @param {...object} arguments
 * @return {object}
 */
exports.extend = function () {
  var args = arguments,
    target = args[0],
    objs = (args.length > 1) ? Array.prototype.slice.call(args, 1) : [],
    i = 0,
    l = objs.length,
    key,
    obj;

  for (i; i < l; i += 1) {
    obj = objs[i] || {};
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        target[key] = obj[key];
      }
    }
  }
  return target;
};

/**
 * Get all of the keys on an object.
 * @param  {object} obj
 * @return {array}
 */
exports.keys = function (obj) {
  if (!obj) {
    return [];
  }

  if (Object.keys) {
    return Object.keys(obj);
  }

  return exports.map(obj, function (v, k) {
    return k;
  });
};

/**
 * Throw an error with possible line number and source file.
 * @param  {string} message Error message
 * @param  {number} [line]  Line number in template.
 * @param  {string} [file]  Template file the error occured in.
 * @throws {Error} No seriously, the point is to throw an error.
 */
exports.throwError = function (message, line, file) {
  if (line) {
    message += ' on line ' + line;
  }
  if (file) {
    message += ' in file ' + file;
  }
  throw new Error(message + '.');
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/swig/lib/utils.js","/../../node_modules/swig/lib")
},{"buffer":2,"oMfpAn":6}],33:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var site = {
  init : function () {
    var helpers = require('./helpers');
    var microAjax = require('./microajax');
    var pubsub = require('./pubsub');
    var swig  = require('swig');
    var app = {
      'help' : helpers,
      'ajax' : microAjax,
      'publish' : pubsub.publish,
      'subscribe' : pubsub.subscribe,
      'unsubscribe' : pubsub.unsubscribe,
      'render' : swig.run,
      'precompile' : swig.precompile
    },
    dom = {
      'overlayClose' : document.getElementById('overlay-close'),
      'overlayContent' : document.getElementById('overlay-content')
    }
    site.events(app, dom);
  },
  events : function (app, dom) {

    app.help.addEventListenerByClass('overlay-trigger', 'click', function(){
      app.help.addBodyClass('overlay-visible');
      app.ajax(window.location.origin + '/fragments/register', function (res) {
        app.publish('/view/register/success', true);
        dom.overlayContent.innerHTML = res;
      });
    });

    dom.overlayClose.addEventListener('click', function(){
      app.help.removeBodyClass('overlay-visible');
      app.publish('/view/overlay/closed', true);
    });

    app.subscribe("/view/register/success", function(flag){
        if(flag === true){
          site.postSignup(app);
          app.help.addEventListenerByClass('help', 'click', function(e){
            app.help.showTooltip(e, 'help-message');
          });
        }
    });

    app.subscribe("/message/error", function(data){
      document.getElementById("error-wrap").innerHTML += data.html;
    })
  },
  postSignup : function(app){
    var submitacct = document.getElementById('create-account-button')
    submitacct.addEventListener('click', function(e){
      e.preventDefault();
      var signupFormEl = document.getElementById("signup");
      var formData = new FormData(signupFormEl);
      app.help.postForm(signupFormEl, function(xhr){
        app.help.removeElementsByClass('error');
        var res = JSON.parse(xhr.response);
        if(res.errors){
          var tpl = app.precompile('{% for error in errors |reverse %}<div class="error">{{ error }}</div>{% endfor %}').tpl
          var template = app.render(tpl, { 'errors' : res.errors });
          app.publish('/message/error', { html : template })
        }
      });
    });
  }
}

site.init();

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_8271bd93.js","/")
},{"./helpers":34,"./microajax":35,"./pubsub":36,"buffer":2,"oMfpAn":6,"swig":7}],34:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var helpers = {
  addEventListenerByClass : function (className, event, fn) {
    var list = document.getElementsByClassName(className);
    for (var i = 0, len = list.length; i < len; i++) {
      list[i].addEventListener(event, fn, false);
    }
  },
  addBodyClass : function (c) {
    return document.getElementsByTagName('body')[0].className +=' '+c;
  },
  removeBodyClass : function (c) {
    document.body.className = document.getElementsByTagName('body')[0].className.replace(c,"");
  },
  removeElementsByClass : function (className) {
    elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
  },
  postForm : function(oFormElement, cb){
    var xhr = new XMLHttpRequest();
    xhr.onload = function(){ cb(xhr) };
    xhr.open (oFormElement.method, oFormElement.action, true);
    xhr.send (new FormData (oFormElement));
    return false;
  },
  showTooltip : function(e, tooltipClass) {
    var message = e.target.parentNode.getElementsByClassName(tooltipClass)[0];
    if(message.className.indexOf("active") > -1){
      message.classList.remove('active');
    } else {
      message.className += ' active';
    }
  }
}

module.exports = helpers;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/helpers.js","/")
},{"buffer":2,"oMfpAn":6}],35:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*
Copyright (c) 2008 Stefan Lange-Hegermann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

function microAjax(url, callbackFunction)
{
	this.bindFunction = function (caller, object) {
		return function() {
			return caller.apply(object, [object]);
		};
	};

	this.stateChange = function (object) {
		if (this.request.readyState==4)
			this.callbackFunction(this.request.responseText);
	};

	this.getRequest = function() {
		if (window.ActiveXObject)
			return new ActiveXObject('Microsoft.XMLHTTP');
		else if (window.XMLHttpRequest)
			return new XMLHttpRequest();
		return false;
	};

	this.postBody = (arguments[2] || "");

	this.callbackFunction=callbackFunction;
	this.url=url;
	this.request = this.getRequest();

	if(this.request) {
		var req = this.request;
		req.onreadystatechange = this.bindFunction(this.stateChange, this);

		if (this.postBody!=="") {
			req.open("POST", url, true);
			req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
			req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
			req.setRequestHeader('Connection', 'close');
		} else {
			req.open("GET", url, true);
		}

		req.send(this.postBody);
	}
}

module.exports = microAjax;

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/microajax.js","/")
},{"buffer":2,"oMfpAn":6}],36:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 * pubsub.js
 *
 * A tiny, optimized, tested, standalone and robust
 * pubsub implementation supporting different javascript environments
 *
 * @author Federico "Lox" Lucignano <http://plus.ly/federico.lox>
 *
 * @see https://github.com/federico-lox/pubsub.js
 */

/*global define, module*/
(function (context) {
	'use strict';

	/**
	 * @private
	 */
	function init() {
		//the channel subscription hash
		var channels = {},
			//help minification
			funcType = Function;

		return {
			/*
			 * @public
			 *
			 * Publish some data on a channel
			 *
			 * @param String channel The channel to publish on
			 * @param Mixed argument The data to publish, the function supports
			 * as many data parameters as needed
			 *
			 * @example Publish stuff on '/some/channel'.
			 * Anything subscribed will be called with a function
			 * signature like: function(a,b,c){ ... }
			 *
			 * PubSub.publish(
			 *		"/some/channel", "a", "b",
			 *		{total: 10, min: 1, max: 3}
			 * );
			 */
			publish: function () {
				//help minification
				var args = arguments,
					// args[0] is the channel
					subs = channels[args[0]],
					len,
					params,
					x;

				if (subs) {
					len = subs.length;
					params = (args.length > 1) ?
							Array.prototype.splice.call(args, 1) : [];

					//run the callbacks asynchronously,
					//do not block the main execution process
					setTimeout(
						function () {
							//executes callbacks in the order
							//in which they were registered
							for (x = 0; x < len; x += 1) {
								subs[x].apply(context, params);
							}

							//clear references to allow garbage collection
							subs = context = params = null;
						},
						0
					);
				}
			},

			/*
			 * @public
			 *
			 * Register a callback on a channel
			 *
			 * @param String channel The channel to subscribe to
			 * @param Function callback The event handler, any time something is
			 * published on a subscribed channel, the callback will be called
			 * with the published array as ordered arguments
			 *
			 * @return Array A handle which can be used to unsubscribe this
			 * particular subscription
			 *
			 * @example PubSub.subscribe(
			 *				"/some/channel",
			 *				function(a, b, c){ ... }
			 *			);
			 */
			subscribe: function (channel, callback) {
				if (typeof channel !== 'string') {
					throw "invalid or missing channel";
				}

				if (!(callback instanceof funcType)) {
					throw "invalid or missing callback";
				}

				if (!channels[channel]) {
					channels[channel] = [];
				}

				channels[channel].push(callback);

				return {channel: channel, callback: callback};
			},

			/*
			 * @public
			 *
			 * Disconnect a subscribed function f.
			 *
			 * @param Mixed handle The return value from a subscribe call or the
			 * name of a channel as a String
			 * @param Function callback [OPTIONAL] The event handler originaally
			 * registered, not needed if handle contains the return value
			 * of subscribe
			 *
			 * @example
			 * var handle = PubSub.subscribe("/some/channel", function(){});
			 * PubSub.unsubscribe(handle);
			 *
			 * or
			 *
			 * PubSub.unsubscribe("/some/channel", callback);
			 */
			unsubscribe: function (handle, callback) {
				if (handle.channel && handle.callback) {
					callback = handle.callback;
					handle = handle.channel;
				}

				if (typeof handle !== 'string') {
					throw "invalid or missing channel";
				}

				if (!(callback instanceof funcType)) {
					throw "invalid or missing callback";
				}

				var subs = channels[handle],
					x,
					y = (subs instanceof Array) ? subs.length : 0;

				for (x = 0; x < y; x += 1) {
					if (subs[x] === callback) {
						subs.splice(x, 1);
						break;
					}
				}
			}
		};
	}

	//UMD
	if (typeof define === 'function' && define.amd) {
		//AMD module
		define('pubsub', init);
	} else if (typeof module === 'object' && module.exports) {
		//CommonJS module
		module.exports = init();
	} else {
		//traditional namespace
		context.PubSub = init();
	}
}(this));

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/pubsub.js","/")
},{"buffer":2,"oMfpAn":6}]},{},[33])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvZGF0ZWZvcm1hdHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2ZpbHRlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sZXhlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvZmlsZXN5c3RlbS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL21lbW9yeS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3BhcnNlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3N3aWcuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2F1dG9lc2NhcGUuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Jsb2NrLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlaWYuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2V4dGVuZHMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2ZpbHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZm9yLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pZi5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW1wb3J0LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmNsdWRlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvbWFjcm8uanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3BhcmVudC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvcmF3LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9zZXQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3NwYWNlbGVzcy5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3V0aWxzLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9zcmMvanMvZmFrZV84MjcxYmQ5My5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvc3JjL2pzL2hlbHBlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9taWNyb2FqYXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9wdWJzdWIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDam5CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzF1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaHRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsbnVsbCwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLFxuICAvLyBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuIElmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgYWRkaW5nXG4gIC8vIHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcywgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnRcbiAgLy8gYmVjYXVzZSB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuIFRoaXMgaXMgYW4gaXNzdWVcbiAgLy8gaW4gRmlyZWZveCA0LTI5LiBOb3cgZml4ZWQ6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBhc3N1bWUgdGhhdCBvYmplY3QgaXMgYXJyYXktbGlrZVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBzdWJqZWN0LmJ5dGVMZW5ndGggPT09ICdudW1iZXInKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgdHlwZWQgYXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAgfHwgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSsxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLCAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFpFUk8gICA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUylcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0bW9kdWxlLmV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRtb2R1bGUuZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSgpKVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5leHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTRcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnlcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9zd2lnJyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZ1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxudmFyIF9tb250aHMgPSB7XG4gICAgZnVsbDogWydKYW51YXJ5JywgJ0ZlYnJ1YXJ5JywgJ01hcmNoJywgJ0FwcmlsJywgJ01heScsICdKdW5lJywgJ0p1bHknLCAnQXVndXN0JywgJ1NlcHRlbWJlcicsICdPY3RvYmVyJywgJ05vdmVtYmVyJywgJ0RlY2VtYmVyJ10sXG4gICAgYWJicjogWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsICdPY3QnLCAnTm92JywgJ0RlYyddXG4gIH0sXG4gIF9kYXlzID0ge1xuICAgIGZ1bGw6IFsnU3VuZGF5JywgJ01vbmRheScsICdUdWVzZGF5JywgJ1dlZG5lc2RheScsICdUaHVyc2RheScsICdGcmlkYXknLCAnU2F0dXJkYXknXSxcbiAgICBhYmJyOiBbJ1N1bicsICdNb24nLCAnVHVlJywgJ1dlZCcsICdUaHUnLCAnRnJpJywgJ1NhdCddLFxuICAgIGFsdDogeyctMSc6ICdZZXN0ZXJkYXknLCAwOiAnVG9kYXknLCAxOiAnVG9tb3Jyb3cnfVxuICB9O1xuXG4vKlxuRGF0ZVogaXMgbGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlOlxuQ29weXJpZ2h0IChjKSAyMDExIFRvbW8gVW5pdmVyc2FsaXMgKGh0dHA6Ly90b21vdW5pdmVyc2FsaXMuY29tKVxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG4qL1xuZXhwb3J0cy50ek9mZnNldCA9IDA7XG5leHBvcnRzLkRhdGVaID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWVtYmVycyA9IHtcbiAgICAgICdkZWZhdWx0JzogWydnZXRVVENEYXRlJywgJ2dldFVUQ0RheScsICdnZXRVVENGdWxsWWVhcicsICdnZXRVVENIb3VycycsICdnZXRVVENNaWxsaXNlY29uZHMnLCAnZ2V0VVRDTWludXRlcycsICdnZXRVVENNb250aCcsICdnZXRVVENTZWNvbmRzJywgJ3RvSVNPU3RyaW5nJywgJ3RvR01UU3RyaW5nJywgJ3RvVVRDU3RyaW5nJywgJ3ZhbHVlT2YnLCAnZ2V0VGltZSddLFxuICAgICAgejogWydnZXREYXRlJywgJ2dldERheScsICdnZXRGdWxsWWVhcicsICdnZXRIb3VycycsICdnZXRNaWxsaXNlY29uZHMnLCAnZ2V0TWludXRlcycsICdnZXRNb250aCcsICdnZXRTZWNvbmRzJywgJ2dldFllYXInLCAndG9EYXRlU3RyaW5nJywgJ3RvTG9jYWxlRGF0ZVN0cmluZycsICd0b0xvY2FsZVRpbWVTdHJpbmcnXVxuICAgIH0sXG4gICAgZCA9IHRoaXM7XG5cbiAgZC5kYXRlID0gZC5kYXRlWiA9IChhcmd1bWVudHMubGVuZ3RoID4gMSkgPyBuZXcgRGF0ZShEYXRlLlVUQy5hcHBseShEYXRlLCBhcmd1bWVudHMpICsgKChuZXcgRGF0ZSgpKS5nZXRUaW1lem9uZU9mZnNldCgpICogNjAwMDApKSA6IChhcmd1bWVudHMubGVuZ3RoID09PSAxKSA/IG5ldyBEYXRlKG5ldyBEYXRlKGFyZ3VtZW50c1snMCddKSkgOiBuZXcgRGF0ZSgpO1xuXG4gIGQudGltZXpvbmVPZmZzZXQgPSBkLmRhdGVaLmdldFRpbWV6b25lT2Zmc2V0KCk7XG5cbiAgdXRpbHMuZWFjaChtZW1iZXJzLnosIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgZFtuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBkLmRhdGVaW25hbWVdKCk7XG4gICAgfTtcbiAgfSk7XG4gIHV0aWxzLmVhY2gobWVtYmVyc1snZGVmYXVsdCddLCBmdW5jdGlvbiAobmFtZSkge1xuICAgIGRbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZC5kYXRlW25hbWVdKCk7XG4gICAgfTtcbiAgfSk7XG5cbiAgdGhpcy5zZXRUaW1lem9uZU9mZnNldChleHBvcnRzLnR6T2Zmc2V0KTtcbn07XG5leHBvcnRzLkRhdGVaLnByb3RvdHlwZSA9IHtcbiAgZ2V0VGltZXpvbmVPZmZzZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aW1lem9uZU9mZnNldDtcbiAgfSxcbiAgc2V0VGltZXpvbmVPZmZzZXQ6IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgICB0aGlzLnRpbWV6b25lT2Zmc2V0ID0gb2Zmc2V0O1xuICAgIHRoaXMuZGF0ZVogPSBuZXcgRGF0ZSh0aGlzLmRhdGUuZ2V0VGltZSgpICsgdGhpcy5kYXRlLmdldFRpbWV6b25lT2Zmc2V0KCkgKiA2MDAwMCAtIHRoaXMudGltZXpvbmVPZmZzZXQgKiA2MDAwMCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn07XG5cbi8vIERheVxuZXhwb3J0cy5kID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiAoaW5wdXQuZ2V0RGF0ZSgpIDwgMTAgPyAnMCcgOiAnJykgKyBpbnB1dC5nZXREYXRlKCk7XG59O1xuZXhwb3J0cy5EID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBfZGF5cy5hYmJyW2lucHV0LmdldERheSgpXTtcbn07XG5leHBvcnRzLmogPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldERhdGUoKTtcbn07XG5leHBvcnRzLmwgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIF9kYXlzLmZ1bGxbaW5wdXQuZ2V0RGF5KCldO1xufTtcbmV4cG9ydHMuTiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgZCA9IGlucHV0LmdldERheSgpO1xuICByZXR1cm4gKGQgPj0gMSkgPyBkIDogNztcbn07XG5leHBvcnRzLlMgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGQgPSBpbnB1dC5nZXREYXRlKCk7XG4gIHJldHVybiAoZCAlIDEwID09PSAxICYmIGQgIT09IDExID8gJ3N0JyA6IChkICUgMTAgPT09IDIgJiYgZCAhPT0gMTIgPyAnbmQnIDogKGQgJSAxMCA9PT0gMyAmJiBkICE9PSAxMyA/ICdyZCcgOiAndGgnKSkpO1xufTtcbmV4cG9ydHMudyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0RGF5KCk7XG59O1xuZXhwb3J0cy56ID0gZnVuY3Rpb24gKGlucHV0LCBvZmZzZXQsIGFiYnIpIHtcbiAgdmFyIHllYXIgPSBpbnB1dC5nZXRGdWxsWWVhcigpLFxuICAgIGUgPSBuZXcgZXhwb3J0cy5EYXRlWih5ZWFyLCBpbnB1dC5nZXRNb250aCgpLCBpbnB1dC5nZXREYXRlKCksIDEyLCAwLCAwKSxcbiAgICBkID0gbmV3IGV4cG9ydHMuRGF0ZVooeWVhciwgMCwgMSwgMTIsIDAsIDApO1xuXG4gIGUuc2V0VGltZXpvbmVPZmZzZXQob2Zmc2V0LCBhYmJyKTtcbiAgZC5zZXRUaW1lem9uZU9mZnNldChvZmZzZXQsIGFiYnIpO1xuICByZXR1cm4gTWF0aC5yb3VuZCgoZSAtIGQpIC8gODY0MDAwMDApO1xufTtcblxuLy8gV2Vla1xuZXhwb3J0cy5XID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciB0YXJnZXQgPSBuZXcgRGF0ZShpbnB1dC52YWx1ZU9mKCkpLFxuICAgIGRheU5yID0gKGlucHV0LmdldERheSgpICsgNikgJSA3LFxuICAgIGZUaHVycztcblxuICB0YXJnZXQuc2V0RGF0ZSh0YXJnZXQuZ2V0RGF0ZSgpIC0gZGF5TnIgKyAzKTtcbiAgZlRodXJzID0gdGFyZ2V0LnZhbHVlT2YoKTtcbiAgdGFyZ2V0LnNldE1vbnRoKDAsIDEpO1xuICBpZiAodGFyZ2V0LmdldERheSgpICE9PSA0KSB7XG4gICAgdGFyZ2V0LnNldE1vbnRoKDAsIDEgKyAoKDQgLSB0YXJnZXQuZ2V0RGF5KCkpICsgNykgJSA3KTtcbiAgfVxuXG4gIHJldHVybiAxICsgTWF0aC5jZWlsKChmVGh1cnMgLSB0YXJnZXQpIC8gNjA0ODAwMDAwKTtcbn07XG5cbi8vIE1vbnRoXG5leHBvcnRzLkYgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIF9tb250aHMuZnVsbFtpbnB1dC5nZXRNb250aCgpXTtcbn07XG5leHBvcnRzLm0gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIChpbnB1dC5nZXRNb250aCgpIDwgOSA/ICcwJyA6ICcnKSArIChpbnB1dC5nZXRNb250aCgpICsgMSk7XG59O1xuZXhwb3J0cy5NID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBfbW9udGhzLmFiYnJbaW5wdXQuZ2V0TW9udGgoKV07XG59O1xuZXhwb3J0cy5uID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRNb250aCgpICsgMTtcbn07XG5leHBvcnRzLnQgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIDMyIC0gKG5ldyBEYXRlKGlucHV0LmdldEZ1bGxZZWFyKCksIGlucHV0LmdldE1vbnRoKCksIDMyKS5nZXREYXRlKCkpO1xufTtcblxuLy8gWWVhclxuZXhwb3J0cy5MID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBuZXcgRGF0ZShpbnB1dC5nZXRGdWxsWWVhcigpLCAxLCAyOSkuZ2V0RGF0ZSgpID09PSAyOTtcbn07XG5leHBvcnRzLm8gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIHRhcmdldCA9IG5ldyBEYXRlKGlucHV0LnZhbHVlT2YoKSk7XG4gIHRhcmdldC5zZXREYXRlKHRhcmdldC5nZXREYXRlKCkgLSAoKGlucHV0LmdldERheSgpICsgNikgJSA3KSArIDMpO1xuICByZXR1cm4gdGFyZ2V0LmdldEZ1bGxZZWFyKCk7XG59O1xuZXhwb3J0cy5ZID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRGdWxsWWVhcigpO1xufTtcbmV4cG9ydHMueSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gKGlucHV0LmdldEZ1bGxZZWFyKCkudG9TdHJpbmcoKSkuc3Vic3RyKDIpO1xufTtcblxuLy8gVGltZVxuZXhwb3J0cy5hID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRIb3VycygpIDwgMTIgPyAnYW0nIDogJ3BtJztcbn07XG5leHBvcnRzLkEgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldEhvdXJzKCkgPCAxMiA/ICdBTScgOiAnUE0nO1xufTtcbmV4cG9ydHMuQiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgaG91cnMgPSBpbnB1dC5nZXRVVENIb3VycygpLCBiZWF0cztcbiAgaG91cnMgPSAoaG91cnMgPT09IDIzKSA/IDAgOiBob3VycyArIDE7XG4gIGJlYXRzID0gTWF0aC5hYnMoKCgoKGhvdXJzICogNjApICsgaW5wdXQuZ2V0VVRDTWludXRlcygpKSAqIDYwKSArIGlucHV0LmdldFVUQ1NlY29uZHMoKSkgLyA4Ni40KS50b0ZpeGVkKDApO1xuICByZXR1cm4gKCcwMDAnLmNvbmNhdChiZWF0cykuc2xpY2UoYmVhdHMubGVuZ3RoKSk7XG59O1xuZXhwb3J0cy5nID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBoID0gaW5wdXQuZ2V0SG91cnMoKTtcbiAgcmV0dXJuIGggPT09IDAgPyAxMiA6IChoID4gMTIgPyBoIC0gMTIgOiBoKTtcbn07XG5leHBvcnRzLkcgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldEhvdXJzKCk7XG59O1xuZXhwb3J0cy5oID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBoID0gaW5wdXQuZ2V0SG91cnMoKTtcbiAgcmV0dXJuICgoaCA8IDEwIHx8ICgxMiA8IGggJiYgMjIgPiBoKSkgPyAnMCcgOiAnJykgKyAoKGggPCAxMikgPyBoIDogaCAtIDEyKTtcbn07XG5leHBvcnRzLkggPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGggPSBpbnB1dC5nZXRIb3VycygpO1xuICByZXR1cm4gKGggPCAxMCA/ICcwJyA6ICcnKSArIGg7XG59O1xuZXhwb3J0cy5pID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBtID0gaW5wdXQuZ2V0TWludXRlcygpO1xuICByZXR1cm4gKG0gPCAxMCA/ICcwJyA6ICcnKSArIG07XG59O1xuZXhwb3J0cy5zID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBzID0gaW5wdXQuZ2V0U2Vjb25kcygpO1xuICByZXR1cm4gKHMgPCAxMCA/ICcwJyA6ICcnKSArIHM7XG59O1xuLy91ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJyc7IH0sXG5cbi8vIFRpbWV6b25lXG4vL2UgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnJzsgfSxcbi8vSSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcnOyB9LFxuZXhwb3J0cy5PID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciB0eiA9IGlucHV0LmdldFRpbWV6b25lT2Zmc2V0KCk7XG4gIHJldHVybiAodHogPCAwID8gJy0nIDogJysnKSArICh0eiAvIDYwIDwgMTAgPyAnMCcgOiAnJykgKyBNYXRoLmFicygodHogLyA2MCkpICsgJzAwJztcbn07XG4vL1QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnJzsgfSxcbmV4cG9ydHMuWiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwO1xufTtcblxuLy8gRnVsbCBEYXRlL1RpbWVcbmV4cG9ydHMuYyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQudG9JU09TdHJpbmcoKTtcbn07XG5leHBvcnRzLnIgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LnRvVVRDU3RyaW5nKCk7XG59O1xuZXhwb3J0cy5VID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRUaW1lKCkgLyAxMDAwO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvZGF0ZWZvcm1hdHRlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKSxcbiAgZGF0ZUZvcm1hdHRlciA9IHJlcXVpcmUoJy4vZGF0ZWZvcm1hdHRlcicpO1xuXG4vKipcbiAqIEhlbHBlciBtZXRob2QgdG8gcmVjdXJzaXZlbHkgcnVuIGEgZmlsdGVyIGFjcm9zcyBhbiBvYmplY3QvYXJyYXkgYW5kIGFwcGx5IGl0IHRvIGFsbCBvZiB0aGUgb2JqZWN0L2FycmF5J3MgdmFsdWVzLlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEByZXR1cm4geyp9XG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBpdGVyYXRlRmlsdGVyKGlucHV0KSB7XG4gIHZhciBzZWxmID0gdGhpcyxcbiAgICBvdXQgPSB7fTtcblxuICBpZiAodXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICByZXR1cm4gdXRpbHMubWFwKGlucHV0LCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHJldHVybiBzZWxmLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfSk7XG4gIH1cblxuICBpZiAodHlwZW9mIGlucHV0ID09PSAnb2JqZWN0Jykge1xuICAgIHV0aWxzLmVhY2goaW5wdXQsIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICBvdXRba2V5XSA9IHNlbGYuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuO1xufVxuXG4vKipcbiAqIEJhY2tzbGFzaC1lc2NhcGUgY2hhcmFjdGVycyB0aGF0IG5lZWQgdG8gYmUgZXNjYXBlZC5cbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCJcXFwicXVvdGVkIHN0cmluZ1xcXCJcInxhZGRzbGFzaGVzIH19XG4gKiAvLyA9PiBcXFwicXVvdGVkIHN0cmluZ1xcXCJcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICBCYWNrc2xhc2gtZXNjYXBlZCBzdHJpbmcuXG4gKi9cbmV4cG9ydHMuYWRkc2xhc2hlcyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLmFkZHNsYXNoZXMsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cXCcvZywgXCJcXFxcJ1wiKS5yZXBsYWNlKC9cXFwiL2csICdcXFxcXCInKTtcbn07XG5cbi8qKlxuICogVXBwZXItY2FzZSB0aGUgZmlyc3QgbGV0dGVyIG9mIHRoZSBpbnB1dCBhbmQgbG93ZXItY2FzZSB0aGUgcmVzdC5cbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCJpIGxpa2UgQnVycml0b3NcInxjYXBpdGFsaXplIH19XG4gKiAvLyA9PiBJIGxpa2UgYnVycml0b3NcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dCAgSWYgZ2l2ZW4gYW4gYXJyYXkgb3Igb2JqZWN0LCBlYWNoIHN0cmluZyBtZW1iZXIgd2lsbCBiZSBydW4gdGhyb3VnaCB0aGUgZmlsdGVyIGluZGl2aWR1YWxseS5cbiAqIEByZXR1cm4geyp9ICAgICAgICBSZXR1cm5zIHRoZSBzYW1lIHR5cGUgYXMgdGhlIGlucHV0LlxuICovXG5leHBvcnRzLmNhcGl0YWxpemUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy5jYXBpdGFsaXplLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnRvU3RyaW5nKCkuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBpbnB1dC50b1N0cmluZygpLnN1YnN0cigxKS50b0xvd2VyQ2FzZSgpO1xufTtcblxuLyoqXG4gKiBGb3JtYXQgYSBkYXRlIG9yIERhdGUtY29tcGF0aWJsZSBzdHJpbmcuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG5vdyA9IG5ldyBEYXRlKCk7XG4gKiB7eyBub3d8ZGF0ZSgnWS1tLWQnKSB9fVxuICogLy8gPT4gMjAxMy0wOC0xNFxuICpcbiAqIEBwYXJhbSAgez8oc3RyaW5nfGRhdGUpfSBpbnB1dFxuICogQHBhcmFtICB7c3RyaW5nfSBmb3JtYXQgIFBIUC1zdHlsZSBkYXRlIGZvcm1hdCBjb21wYXRpYmxlIHN0cmluZy5cbiAqIEBwYXJhbSAge251bWJlcj19IG9mZnNldCBUaW1lem9uZSBvZmZzZXQgZnJvbSBHTVQgaW4gbWludXRlcy5cbiAqIEBwYXJhbSAge3N0cmluZz19IGFiYnIgICBUaW1lem9uZSBhYmJyZXZpYXRpb24uIFVzZWQgZm9yIG91dHB1dCBvbmx5LlxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgIEZvcm1hdHRlZCBkYXRlIHN0cmluZy5cbiAqL1xuZXhwb3J0cy5kYXRlID0gZnVuY3Rpb24gKGlucHV0LCBmb3JtYXQsIG9mZnNldCwgYWJicikge1xuICB2YXIgbCA9IGZvcm1hdC5sZW5ndGgsXG4gICAgZGF0ZSA9IG5ldyBkYXRlRm9ybWF0dGVyLkRhdGVaKGlucHV0KSxcbiAgICBjdXIsXG4gICAgaSA9IDAsXG4gICAgb3V0ID0gJyc7XG5cbiAgaWYgKG9mZnNldCkge1xuICAgIGRhdGUuc2V0VGltZXpvbmVPZmZzZXQob2Zmc2V0LCBhYmJyKTtcbiAgfVxuXG4gIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgIGN1ciA9IGZvcm1hdC5jaGFyQXQoaSk7XG4gICAgaWYgKGRhdGVGb3JtYXR0ZXIuaGFzT3duUHJvcGVydHkoY3VyKSkge1xuICAgICAgb3V0ICs9IGRhdGVGb3JtYXR0ZXJbY3VyXShkYXRlLCBvZmZzZXQsIGFiYnIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXQgKz0gY3VyO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJZiB0aGUgaW5wdXQgaXMgYHVuZGVmaW5lZGAsIGBudWxsYCwgb3IgYGZhbHNlYCwgYSBkZWZhdWx0IHJldHVybiB2YWx1ZSBjYW4gYmUgc3BlY2lmaWVkLlxuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBudWxsX3ZhbHVlfGRlZmF1bHQoJ1RhY29zJykgfX1cbiAqIC8vID0+IFRhY29zXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiQnVycml0b3NcInxkZWZhdWx0KFwiVGFjb3NcIikgfX1cbiAqIC8vID0+IEJ1cnJpdG9zXG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcGFyYW0gIHsqfSAgZGVmICAgICBWYWx1ZSB0byByZXR1cm4gaWYgYGlucHV0YCBpcyBgdW5kZWZpbmVkYCwgYG51bGxgLCBvciBgZmFsc2VgLlxuICogQHJldHVybiB7Kn0gICAgICAgICAgYGlucHV0YCBvciBgZGVmYCB2YWx1ZS5cbiAqL1xuZXhwb3J0c1tcImRlZmF1bHRcIl0gPSBmdW5jdGlvbiAoaW5wdXQsIGRlZikge1xuICByZXR1cm4gKHR5cGVvZiBpbnB1dCAhPT0gJ3VuZGVmaW5lZCcgJiYgKGlucHV0IHx8IHR5cGVvZiBpbnB1dCA9PT0gJ251bWJlcicpKSA/IGlucHV0IDogZGVmO1xufTtcblxuLyoqXG4gKiBGb3JjZSBlc2NhcGUgdGhlIG91dHB1dCBvZiB0aGUgdmFyaWFibGUuIE9wdGlvbmFsbHkgdXNlIGBlYCBhcyBhIHNob3J0Y3V0IGZpbHRlciBuYW1lLiBUaGlzIGZpbHRlciB3aWxsIGJlIGFwcGxpZWQgYnkgZGVmYXVsdCBpZiBhdXRvZXNjYXBlIGlzIHR1cm5lZCBvbi5cbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCI8YmxhaD5cInxlc2NhcGUgfX1cbiAqIC8vID0+ICZsdDtibGFoJmd0O1xuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcIjxibGFoPlwifGUoXCJqc1wiKSB9fVxuICogLy8gPT4gXFx1MDAzQ2JsYWhcXHUwMDNFXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEBwYXJhbSAge3N0cmluZ30gW3R5cGU9J2h0bWwnXSAgIElmIHlvdSBwYXNzIHRoZSBzdHJpbmcganMgaW4gYXMgdGhlIHR5cGUsIG91dHB1dCB3aWxsIGJlIGVzY2FwZWQgc28gdGhhdCBpdCBpcyBzYWZlIGZvciBKYXZhU2NyaXB0IGV4ZWN1dGlvbi5cbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICBFc2NhcGVkIHN0cmluZy5cbiAqL1xuZXhwb3J0cy5lc2NhcGUgPSBmdW5jdGlvbiAoaW5wdXQsIHR5cGUpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy5lc2NhcGUsIGFyZ3VtZW50cyksXG4gICAgaW5wID0gaW5wdXQsXG4gICAgaSA9IDAsXG4gICAgY29kZTtcblxuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQ7XG4gIH1cblxuICBvdXQgPSAnJztcblxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgY2FzZSAnanMnOlxuICAgIGlucCA9IGlucC5yZXBsYWNlKC9cXFxcL2csICdcXFxcdTAwNUMnKTtcbiAgICBmb3IgKGk7IGkgPCBpbnAubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvZGUgPSBpbnAuY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlIDwgMzIpIHtcbiAgICAgICAgY29kZSA9IGNvZGUudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNvZGUgPSAoY29kZS5sZW5ndGggPCAyKSA/ICcwJyArIGNvZGUgOiBjb2RlO1xuICAgICAgICBvdXQgKz0gJ1xcXFx1MDAnICsgY29kZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dCArPSBpbnBbaV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXQucmVwbGFjZSgvJi9nLCAnXFxcXHUwMDI2JylcbiAgICAgIC5yZXBsYWNlKC88L2csICdcXFxcdTAwM0MnKVxuICAgICAgLnJlcGxhY2UoLz4vZywgJ1xcXFx1MDAzRScpXG4gICAgICAucmVwbGFjZSgvXFwnL2csICdcXFxcdTAwMjcnKVxuICAgICAgLnJlcGxhY2UoL1wiL2csICdcXFxcdTAwMjInKVxuICAgICAgLnJlcGxhY2UoL1xcPS9nLCAnXFxcXHUwMDNEJylcbiAgICAgIC5yZXBsYWNlKC8tL2csICdcXFxcdTAwMkQnKVxuICAgICAgLnJlcGxhY2UoLzsvZywgJ1xcXFx1MDAzQicpO1xuXG4gIGRlZmF1bHQ6XG4gICAgcmV0dXJuIGlucC5yZXBsYWNlKC8mKD8hYW1wO3xsdDt8Z3Q7fHF1b3Q7fCMzOTspL2csICcmYW1wOycpXG4gICAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgICAucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcbiAgfVxufTtcbmV4cG9ydHMuZSA9IGV4cG9ydHMuZXNjYXBlO1xuXG4vKipcbiAqIEdldCB0aGUgZmlyc3QgaXRlbSBpbiBhbiBhcnJheSBvciBjaGFyYWN0ZXIgaW4gYSBzdHJpbmcuIEFsbCBvdGhlciBvYmplY3RzIHdpbGwgYXR0ZW1wdCB0byByZXR1cm4gdGhlIGZpcnN0IHZhbHVlIGF2YWlsYWJsZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyID0gWydhJywgJ2InLCAnYyddXG4gKiB7eyBteV9hcnJ8Zmlyc3QgfX1cbiAqIC8vID0+IGFcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFsID0gJ1RhY29zJ1xuICoge3sgbXlfdmFsfGZpcnN0IH19XG4gKiAvLyBUXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICBUaGUgZmlyc3QgaXRlbSBvZiB0aGUgYXJyYXkgb3IgZmlyc3QgY2hhcmFjdGVyIG9mIHRoZSBzdHJpbmcgaW5wdXQuXG4gKi9cbmV4cG9ydHMuZmlyc3QgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcgJiYgIXV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgdmFyIGtleXMgPSB1dGlscy5rZXlzKGlucHV0KTtcbiAgICByZXR1cm4gaW5wdXRba2V5c1swXV07XG4gIH1cblxuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5zdWJzdHIoMCwgMSk7XG4gIH1cblxuICByZXR1cm4gaW5wdXRbMF07XG59O1xuXG4vKipcbiAqIEdyb3VwIGFuIGFycmF5IG9mIG9iamVjdHMgYnkgYSBjb21tb24ga2V5LiBJZiBhbiBhcnJheSBpcyBub3QgcHJvdmlkZWQsIHRoZSBpbnB1dCB2YWx1ZSB3aWxsIGJlIHJldHVybmVkIHVudG91Y2hlZC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gcGVvcGxlID0gW3sgYWdlOiAyMywgbmFtZTogJ1BhdWwnIH0sIHsgYWdlOiAyNiwgbmFtZTogJ0phbmUnIH0sIHsgYWdlOiAyMywgbmFtZTogJ0ppbScgfV07XG4gKiB7JSBmb3IgYWdlZ3JvdXAgaW4gcGVvcGxlfGdyb3VwQnkoJ2FnZScpICV9XG4gKiAgIDxoMj57eyBsb29wLmtleSB9fTwvaDI+XG4gKiAgIDx1bD5cbiAqICAgICB7JSBmb3IgcGVyc29uIGluIGFnZWdyb3VwICV9XG4gKiAgICAgPGxpPnt7IHBlcnNvbi5uYW1lIH19PC9saT5cbiAqICAgICB7JSBlbmRmb3IgJX1cbiAqICAgPC91bD5cbiAqIHslIGVuZGZvciAlfVxuICpcbiAqIEBwYXJhbSAgeyp9ICAgICAgaW5wdXQgSW5wdXQgb2JqZWN0LlxuICogQHBhcmFtICB7c3RyaW5nfSBrZXkgICBLZXkgdG8gZ3JvdXAgYnkuXG4gKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgIEdyb3VwZWQgYXJyYXlzIGJ5IGdpdmVuIGtleS5cbiAqL1xuZXhwb3J0cy5ncm91cEJ5ID0gZnVuY3Rpb24gKGlucHV0LCBrZXkpIHtcbiAgaWYgKCF1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHJldHVybiBpbnB1dDtcbiAgfVxuXG4gIHZhciBvdXQgPSB7fTtcblxuICB1dGlscy5lYWNoKGlucHV0LCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAoIXZhbHVlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIga2V5bmFtZSA9IHZhbHVlW2tleV0sXG4gICAgICBuZXdWYWwgPSB1dGlscy5leHRlbmQoe30sIHZhbHVlKTtcbiAgICBkZWxldGUgdmFsdWVba2V5XTtcblxuICAgIGlmICghb3V0W2tleW5hbWVdKSB7XG4gICAgICBvdXRba2V5bmFtZV0gPSBbXTtcbiAgICB9XG5cbiAgICBvdXRba2V5bmFtZV0ucHVzaCh2YWx1ZSk7XG4gIH0pO1xuXG4gIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEpvaW4gdGhlIGlucHV0IHdpdGggYSBzdHJpbmcuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FycmF5ID0gWydmb28nLCAnYmFyJywgJ2JheiddXG4gKiB7eyBteV9hcnJheXxqb2luKCcsICcpIH19XG4gKiAvLyA9PiBmb28sIGJhciwgYmF6XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2tleV9vYmplY3QgPSB7IGE6ICdmb28nLCBiOiAnYmFyJywgYzogJ2JheicgfVxuICoge3sgbXlfa2V5X29iamVjdHxqb2luKCcgYW5kICcpIH19XG4gKiAvLyA9PiBmb28gYW5kIGJhciBhbmQgYmF6XG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcGFyYW0gIHtzdHJpbmd9IGdsdWUgICAgU3RyaW5nIHZhbHVlIHRvIGpvaW4gaXRlbXMgdG9nZXRoZXIuXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uIChpbnB1dCwgZ2x1ZSkge1xuICBpZiAodXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICByZXR1cm4gaW5wdXQuam9pbihnbHVlKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIG91dCA9IFtdO1xuICAgIHV0aWxzLmVhY2goaW5wdXQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgb3V0LnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBvdXQuam9pbihnbHVlKTtcbiAgfVxuICByZXR1cm4gaW5wdXQ7XG59O1xuXG4vKipcbiAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhbiBKYXZhU2NyaXB0IG9iamVjdC5cbiAqXG4gKiBCYWNrd2FyZHMgY29tcGF0aWJsZSB3aXRoIHN3aWdAMC54LnggdXNpbmcgYGpzb25fZW5jb2RlYC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0geyBhOiAnYicgfVxuICoge3sgdmFsfGpzb24gfX1cbiAqIC8vID0+IHtcImFcIjpcImJcIn1cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0geyBhOiAnYicgfVxuICoge3sgdmFsfGpzb24oNCkgfX1cbiAqIC8vID0+IHtcbiAqIC8vICAgICAgICBcImFcIjogXCJiXCJcbiAqIC8vICAgIH1cbiAqXG4gKiBAcGFyYW0gIHsqfSAgICBpbnB1dFxuICogQHBhcmFtICB7bnVtYmVyfSAgW2luZGVudF0gIE51bWJlciBvZiBzcGFjZXMgdG8gaW5kZW50IGZvciBwcmV0dHktZm9ybWF0dGluZy5cbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgIEEgdmFsaWQgSlNPTiBzdHJpbmcuXG4gKi9cbmV4cG9ydHMuanNvbiA9IGZ1bmN0aW9uIChpbnB1dCwgaW5kZW50KSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShpbnB1dCwgbnVsbCwgaW5kZW50IHx8IDApO1xufTtcbmV4cG9ydHMuanNvbl9lbmNvZGUgPSBleHBvcnRzLmpzb247XG5cbi8qKlxuICogR2V0IHRoZSBsYXN0IGl0ZW0gaW4gYW4gYXJyYXkgb3IgY2hhcmFjdGVyIGluIGEgc3RyaW5nLiBBbGwgb3RoZXIgb2JqZWN0cyB3aWxsIGF0dGVtcHQgdG8gcmV0dXJuIHRoZSBsYXN0IHZhbHVlIGF2YWlsYWJsZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyID0gWydhJywgJ2InLCAnYyddXG4gKiB7eyBteV9hcnJ8bGFzdCB9fVxuICogLy8gPT4gY1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YWwgPSAnVGFjb3MnXG4gKiB7eyBteV92YWx8bGFzdCB9fVxuICogLy8gc1xuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgICBUaGUgbGFzdCBpdGVtIG9mIHRoZSBhcnJheSBvciBsYXN0IGNoYXJhY3RlciBvZiB0aGUgc3RyaW5nLmlucHV0LlxuICovXG5leHBvcnRzLmxhc3QgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcgJiYgIXV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgdmFyIGtleXMgPSB1dGlscy5rZXlzKGlucHV0KTtcbiAgICByZXR1cm4gaW5wdXRba2V5c1trZXlzLmxlbmd0aCAtIDFdXTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0LmNoYXJBdChpbnB1dC5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiBpbnB1dFtpbnB1dC5sZW5ndGggLSAxXTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBpbnB1dCBpbiBhbGwgbG93ZXJjYXNlIGxldHRlcnMuXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiRk9PQkFSXCJ8bG93ZXIgfX1cbiAqIC8vID0+IGZvb2JhclxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteU9iaiA9IHsgYTogJ0ZPTycsIGI6ICdCQVInIH1cbiAqIHt7IG15T2JqfGxvd2VyfGpvaW4oJycpIH19XG4gKiAvLyA9PiBmb29iYXJcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICAgIFJldHVybnMgdGhlIHNhbWUgdHlwZSBhcyB0aGUgaW5wdXQuXG4gKi9cbmV4cG9ydHMubG93ZXIgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy5sb3dlciwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC50b1N0cmluZygpLnRvTG93ZXJDYXNlKCk7XG59O1xuXG4vKipcbiAqIERlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgPGEgaHJlZj1cIiNzYWZlXCI+c2FmZTwvYT4uXG4gKi9cbmV4cG9ydHMucmF3ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBleHBvcnRzLnNhZmUoaW5wdXQpO1xufTtcbmV4cG9ydHMucmF3LnNhZmUgPSB0cnVlO1xuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgc3RyaW5nIHdpdGggdGhlIG1hdGNoZWQgc2VhcmNoIHBhdHRlcm4gcmVwbGFjZWQgYnkgdGhlIGdpdmVuIHJlcGxhY2VtZW50IHN0cmluZy4gVXNlcyBKYXZhU2NyaXB0J3MgYnVpbHQtaW4gU3RyaW5nLnJlcGxhY2UoKSBtZXRob2QuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhciA9ICdmb29iYXInO1xuICoge3sgbXlfdmFyfHJlcGxhY2UoJ28nLCAnZScsICdnJykgfX1cbiAqIC8vID0+IGZlZWJhclxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YXIgPSBcImZhcmZlZ251Z2VuXCI7XG4gKiB7eyBteV92YXJ8cmVwbGFjZSgnXmYnLCAncCcpIH19XG4gKiAvLyA9PiBwYXJmZWdudWdlblxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YXIgPSAnYTFiMmMzJztcbiAqIHt7IG15X3ZhcnxyZXBsYWNlKCdcXHcnLCAnMCcsICdnJykgfX1cbiAqIC8vID0+IDAxMDIwM1xuICpcbiAqIEBwYXJhbSAge3N0cmluZ30gaW5wdXRcbiAqIEBwYXJhbSAge3N0cmluZ30gc2VhcmNoICAgICAgU3RyaW5nIG9yIHBhdHRlcm4gdG8gcmVwbGFjZSBmcm9tIHRoZSBpbnB1dC5cbiAqIEBwYXJhbSAge3N0cmluZ30gcmVwbGFjZW1lbnQgU3RyaW5nIHRvIHJlcGxhY2UgbWF0Y2hlZCBwYXR0ZXJuLlxuICogQHBhcmFtICB7c3RyaW5nfSBbZmxhZ3NdICAgICAgUmVndWxhciBFeHByZXNzaW9uIGZsYWdzLiAnZyc6IGdsb2JhbCBtYXRjaCwgJ2knOiBpZ25vcmUgY2FzZSwgJ20nOiBtYXRjaCBvdmVyIG11bHRpcGxlIGxpbmVzXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgIFJlcGxhY2VkIHN0cmluZy5cbiAqL1xuZXhwb3J0cy5yZXBsYWNlID0gZnVuY3Rpb24gKGlucHV0LCBzZWFyY2gsIHJlcGxhY2VtZW50LCBmbGFncykge1xuICB2YXIgciA9IG5ldyBSZWdFeHAoc2VhcmNoLCBmbGFncyk7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKHIsIHJlcGxhY2VtZW50KTtcbn07XG5cbi8qKlxuICogUmV2ZXJzZSBzb3J0IHRoZSBpbnB1dC4gVGhpcyBpcyBhbiBhbGlhcyBmb3IgPGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57eyBpbnB1dHxzb3J0KHRydWUpIH19PC9jb2RlPi5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0gWzEsIDIsIDNdO1xuICoge3sgdmFsfHJldmVyc2UgfX1cbiAqIC8vID0+IDMsMiwxXG4gKlxuICogQHBhcmFtICB7YXJyYXl9ICBpbnB1dFxuICogQHJldHVybiB7YXJyYXl9ICAgICAgICBSZXZlcnNlZCBhcnJheS4gVGhlIG9yaWdpbmFsIGlucHV0IG9iamVjdCBpcyByZXR1cm5lZCBpZiBpdCB3YXMgbm90IGFuIGFycmF5LlxuICovXG5leHBvcnRzLnJldmVyc2UgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGV4cG9ydHMuc29ydChpbnB1dCwgdHJ1ZSk7XG59O1xuXG4vKipcbiAqIEZvcmNlcyB0aGUgaW5wdXQgdG8gbm90IGJlIGF1dG8tZXNjYXBlZC4gVXNlIHRoaXMgb25seSBvbiBjb250ZW50IHRoYXQgeW91IGtub3cgaXMgc2FmZSB0byBiZSByZW5kZXJlZCBvbiB5b3VyIHBhZ2UuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhciA9IFwiPHA+U3R1ZmY8L3A+XCI7XG4gKiB7eyBteV92YXJ8c2FmZSB9fVxuICogLy8gPT4gPHA+U3R1ZmY8L3A+XG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgICBUaGUgaW5wdXQgZXhhY3RseSBob3cgaXQgd2FzIGdpdmVuLCByZWdhcmRsZXNzIG9mIGF1dG9lc2NhcGluZyBzdGF0dXMuXG4gKi9cbmV4cG9ydHMuc2FmZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICAvLyBUaGlzIGlzIGEgbWFnaWMgZmlsdGVyLiBJdHMgbG9naWMgaXMgaGFyZC1jb2RlZCBpbnRvIFN3aWcncyBwYXJzZXIuXG4gIHJldHVybiBpbnB1dDtcbn07XG5leHBvcnRzLnNhZmUuc2FmZSA9IHRydWU7XG5cbi8qKlxuICogU29ydCB0aGUgaW5wdXQgaW4gYW4gYXNjZW5kaW5nIGRpcmVjdGlvbi5cbiAqIElmIGdpdmVuIGFuIG9iamVjdCwgd2lsbCByZXR1cm4gdGhlIGtleXMgYXMgYSBzb3J0ZWQgYXJyYXkuXG4gKiBJZiBnaXZlbiBhIHN0cmluZywgZWFjaCBjaGFyYWN0ZXIgd2lsbCBiZSBzb3J0ZWQgaW5kaXZpZHVhbGx5LlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSBbMiwgNiwgNF07XG4gKiB7eyB2YWx8c29ydCB9fVxuICogLy8gPT4gMiw0LDZcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0gJ3phcSc7XG4gKiB7eyB2YWx8c29ydCB9fVxuICogLy8gPT4gYXF6XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9IHsgYmFyOiAxLCBmb286IDIgfVxuICoge3sgdmFsfHNvcnQodHJ1ZSkgfX1cbiAqIC8vID0+IGZvbyxiYXJcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHBhcmFtIHtib29sZWFufSBbcmV2ZXJzZT1mYWxzZV0gT3V0cHV0IGlzIGdpdmVuIHJldmVyc2Utc29ydGVkIGlmIHRydWUuXG4gKiBAcmV0dXJuIHsqfSAgICAgICAgU29ydGVkIGFycmF5O1xuICovXG5leHBvcnRzLnNvcnQgPSBmdW5jdGlvbiAoaW5wdXQsIHJldmVyc2UpIHtcbiAgdmFyIG91dDtcbiAgaWYgKHV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgb3V0ID0gaW5wdXQuc29ydCgpO1xuICB9IGVsc2Uge1xuICAgIHN3aXRjaCAodHlwZW9mIGlucHV0KSB7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIG91dCA9IHV0aWxzLmtleXMoaW5wdXQpLnNvcnQoKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBvdXQgPSBpbnB1dC5zcGxpdCgnJyk7XG4gICAgICBpZiAocmV2ZXJzZSkge1xuICAgICAgICByZXR1cm4gb3V0LnJldmVyc2UoKS5qb2luKCcnKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXQuc29ydCgpLmpvaW4oJycpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChvdXQgJiYgcmV2ZXJzZSkge1xuICAgIHJldHVybiBvdXQucmV2ZXJzZSgpO1xuICB9XG5cbiAgcmV0dXJuIG91dCB8fCBpbnB1dDtcbn07XG5cbi8qKlxuICogU3RyaXAgSFRNTCB0YWdzLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBzdHVmZiA9ICc8cD5mb29iYXI8L3A+JztcbiAqIHt7IHN0dWZmfHN0cmlwdGFncyB9fVxuICogLy8gPT4gZm9vYmFyXG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgUmV0dXJucyB0aGUgc2FtZSBvYmplY3QgYXMgdGhlIGlucHV0LCBidXQgd2l0aCBhbGwgc3RyaW5nIHZhbHVlcyBzdHJpcHBlZCBvZiB0YWdzLlxuICovXG5leHBvcnRzLnN0cmlwdGFncyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLnN0cmlwdGFncywgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC50b1N0cmluZygpLnJlcGxhY2UoLyg8KFtePl0rKT4pL2lnLCAnJyk7XG59O1xuXG4vKipcbiAqIENhcGl0YWxpemVzIGV2ZXJ5IHdvcmQgZ2l2ZW4gYW5kIGxvd2VyLWNhc2VzIGFsbCBvdGhlciBsZXR0ZXJzLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9zdHIgPSAndGhpcyBpcyBzb01lIHRleHQnO1xuICoge3sgbXlfc3RyfHRpdGxlIH19XG4gKiAvLyA9PiBUaGlzIElzIFNvbWUgVGV4dFxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnIgPSBbJ2hpJywgJ3RoaXMnLCAnaXMnLCAnYW4nLCAnYXJyYXknXTtcbiAqIHt7IG15X2Fycnx0aXRsZXxqb2luKCcgJykgfX1cbiAqIC8vID0+IEhpIFRoaXMgSXMgQW4gQXJyYXlcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICBSZXR1cm5zIHRoZSBzYW1lIG9iamVjdCBhcyB0aGUgaW5wdXQsIGJ1dCB3aXRoIGFsbCB3b3JkcyBpbiBzdHJpbmdzIHRpdGxlLWNhc2VkLlxuICovXG5leHBvcnRzLnRpdGxlID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMudGl0bGUsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQudG9TdHJpbmcoKS5yZXBsYWNlKC9cXHdcXFMqL2csIGZ1bmN0aW9uIChzdHIpIHtcbiAgICByZXR1cm4gc3RyLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3RyLnN1YnN0cigxKS50b0xvd2VyQ2FzZSgpO1xuICB9KTtcbn07XG5cbi8qKlxuICogUmVtb3ZlIGFsbCBkdXBsaWNhdGUgaXRlbXMgZnJvbSBhbiBhcnJheS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyID0gWzEsIDIsIDMsIDQsIDQsIDMsIDIsIDFdO1xuICoge3sgbXlfYXJyfHVuaXF8am9pbignLCcpIH19XG4gKiAvLyA9PiAxLDIsMyw0XG4gKlxuICogQHBhcmFtICB7YXJyYXl9ICBpbnB1dFxuICogQHJldHVybiB7YXJyYXl9ICAgICAgICBBcnJheSB3aXRoIHVuaXF1ZSBpdGVtcy4gSWYgaW5wdXQgd2FzIG5vdCBhbiBhcnJheSwgdGhlIG9yaWdpbmFsIGl0ZW0gaXMgcmV0dXJuZWQgdW50b3VjaGVkLlxuICovXG5leHBvcnRzLnVuaXEgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIHJlc3VsdDtcblxuICBpZiAoIWlucHV0IHx8ICF1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHJldHVybiAnJztcbiAgfVxuXG4gIHJlc3VsdCA9IFtdO1xuICB1dGlscy5lYWNoKGlucHV0LCBmdW5jdGlvbiAodikge1xuICAgIGlmIChyZXN1bHQuaW5kZXhPZih2KSA9PT0gLTEpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHYpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgdGhlIGlucHV0IHRvIGFsbCB1cHBlcmNhc2UgbGV0dGVycy4gSWYgYW4gb2JqZWN0IG9yIGFycmF5IGlzIHByb3ZpZGVkLCBhbGwgdmFsdWVzIHdpbGwgYmUgdXBwZXJjYXNlZC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfc3RyID0gJ3RhY29zJztcbiAqIHt7IG15X3N0cnx1cHBlciB9fVxuICogLy8gPT4gVEFDT1NcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyID0gWyd0YWNvcycsICdidXJyaXRvcyddO1xuICoge3sgbXlfYXJyfHVwcGVyfGpvaW4oJyAmICcpIH19XG4gKiAvLyA9PiBUQUNPUyAmIEJVUlJJVE9TXG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgUmV0dXJucyB0aGUgc2FtZSB0eXBlIGFzIHRoZSBpbnB1dCwgd2l0aCBhbGwgc3RyaW5ncyB1cHBlci1jYXNlZC5cbiAqL1xuZXhwb3J0cy51cHBlciA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLnVwcGVyLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnRvU3RyaW5nKCkudG9VcHBlckNhc2UoKTtcbn07XG5cbi8qKlxuICogVVJMLWVuY29kZSBhIHN0cmluZy4gSWYgYW4gb2JqZWN0IG9yIGFycmF5IGlzIHBhc3NlZCwgYWxsIHZhbHVlcyB3aWxsIGJlIFVSTC1lbmNvZGVkLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9zdHIgPSAncGFyYW09MSZhbm90aGVyUGFyYW09Mic7XG4gKiB7eyBteV9zdHJ8dXJsX2VuY29kZSB9fVxuICogLy8gPT4gcGFyYW0lM0QxJTI2YW5vdGhlclBhcmFtJTNEMlxuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICBVUkwtZW5jb2RlZCBzdHJpbmcuXG4gKi9cbmV4cG9ydHMudXJsX2VuY29kZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLnVybF9lbmNvZGUsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChpbnB1dCk7XG59O1xuXG4vKipcbiAqIFVSTC1kZWNvZGUgYSBzdHJpbmcuIElmIGFuIG9iamVjdCBvciBhcnJheSBpcyBwYXNzZWQsIGFsbCB2YWx1ZXMgd2lsbCBiZSBVUkwtZGVjb2RlZC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfc3RyID0gJ3BhcmFtJTNEMSUyNmFub3RoZXJQYXJhbSUzRDInO1xuICoge3sgbXlfc3RyfHVybF9kZWNvZGUgfX1cbiAqIC8vID0+IHBhcmFtPTEmYW5vdGhlclBhcmFtPTJcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgVVJMLWRlY29kZWQgc3RyaW5nLlxuICovXG5leHBvcnRzLnVybF9kZWNvZGUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy51cmxfZGVjb2RlLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG4gIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoaW5wdXQpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvZmlsdGVycy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuLyoqXG4gKiBBIGxleGVyIHRva2VuLlxuICogQHR5cGVkZWYge29iamVjdH0gTGV4ZXJUb2tlblxuICogQHByb3BlcnR5IHtzdHJpbmd9IG1hdGNoICBUaGUgc3RyaW5nIHRoYXQgd2FzIG1hdGNoZWQuXG4gKiBAcHJvcGVydHkge251bWJlcn0gdHlwZSAgIExleGVyIHR5cGUgZW51bS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBsZW5ndGggTGVuZ3RoIG9mIHRoZSBvcmlnaW5hbCBzdHJpbmcgcHJvY2Vzc2VkLlxuICovXG5cbi8qKlxuICogRW51bSBmb3IgdG9rZW4gdHlwZXMuXG4gKiBAcmVhZG9ubHlcbiAqIEBlbnVtIHtudW1iZXJ9XG4gKi9cbnZhciBUWVBFUyA9IHtcbiAgICAvKiogV2hpdGVzcGFjZSAqL1xuICAgIFdISVRFU1BBQ0U6IDAsXG4gICAgLyoqIFBsYWluIHN0cmluZyAqL1xuICAgIFNUUklORzogMSxcbiAgICAvKiogVmFyaWFibGUgZmlsdGVyICovXG4gICAgRklMVEVSOiAyLFxuICAgIC8qKiBFbXB0eSB2YXJpYWJsZSBmaWx0ZXIgKi9cbiAgICBGSUxURVJFTVBUWTogMyxcbiAgICAvKiogRnVuY3Rpb24gKi9cbiAgICBGVU5DVElPTjogNCxcbiAgICAvKiogRnVuY3Rpb24gd2l0aCBubyBhcmd1bWVudHMgKi9cbiAgICBGVU5DVElPTkVNUFRZOiA1LFxuICAgIC8qKiBPcGVuIHBhcmVudGhlc2lzICovXG4gICAgUEFSRU5PUEVOOiA2LFxuICAgIC8qKiBDbG9zZSBwYXJlbnRoZXNpcyAqL1xuICAgIFBBUkVOQ0xPU0U6IDcsXG4gICAgLyoqIENvbW1hICovXG4gICAgQ09NTUE6IDgsXG4gICAgLyoqIFZhcmlhYmxlICovXG4gICAgVkFSOiA5LFxuICAgIC8qKiBOdW1iZXIgKi9cbiAgICBOVU1CRVI6IDEwLFxuICAgIC8qKiBNYXRoIG9wZXJhdG9yICovXG4gICAgT1BFUkFUT1I6IDExLFxuICAgIC8qKiBPcGVuIHNxdWFyZSBicmFja2V0ICovXG4gICAgQlJBQ0tFVE9QRU46IDEyLFxuICAgIC8qKiBDbG9zZSBzcXVhcmUgYnJhY2tldCAqL1xuICAgIEJSQUNLRVRDTE9TRTogMTMsXG4gICAgLyoqIEtleSBvbiBhbiBvYmplY3QgdXNpbmcgZG90LW5vdGF0aW9uICovXG4gICAgRE9US0VZOiAxNCxcbiAgICAvKiogU3RhcnQgb2YgYW4gYXJyYXkgKi9cbiAgICBBUlJBWU9QRU46IDE1LFxuICAgIC8qKiBFbmQgb2YgYW4gYXJyYXlcbiAgICAgKiBDdXJyZW50bHkgdW51c2VkXG4gICAgQVJSQVlDTE9TRTogMTYsICovXG4gICAgLyoqIE9wZW4gY3VybHkgYnJhY2UgKi9cbiAgICBDVVJMWU9QRU46IDE3LFxuICAgIC8qKiBDbG9zZSBjdXJseSBicmFjZSAqL1xuICAgIENVUkxZQ0xPU0U6IDE4LFxuICAgIC8qKiBDb2xvbiAoOikgKi9cbiAgICBDT0xPTjogMTksXG4gICAgLyoqIEphdmFTY3JpcHQtdmFsaWQgY29tcGFyYXRvciAqL1xuICAgIENPTVBBUkFUT1I6IDIwLFxuICAgIC8qKiBCb29sZWFuIGxvZ2ljICovXG4gICAgTE9HSUM6IDIxLFxuICAgIC8qKiBCb29sZWFuIGxvZ2ljIFwibm90XCIgKi9cbiAgICBOT1Q6IDIyLFxuICAgIC8qKiB0cnVlIG9yIGZhbHNlICovXG4gICAgQk9PTDogMjMsXG4gICAgLyoqIFZhcmlhYmxlIGFzc2lnbm1lbnQgKi9cbiAgICBBU1NJR05NRU5UOiAyNCxcbiAgICAvKiogU3RhcnQgb2YgYSBtZXRob2QgKi9cbiAgICBNRVRIT0RPUEVOOiAyNSxcbiAgICAvKiogRW5kIG9mIGEgbWV0aG9kXG4gICAgICogQ3VycmVudGx5IHVudXNlZFxuICAgIE1FVEhPREVORDogMjYsICovXG4gICAgLyoqIFVua25vd24gdHlwZSAqL1xuICAgIFVOS05PV046IDEwMFxuICB9LFxuICBydWxlcyA9IFtcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5XSElURVNQQUNFLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHMrL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuU1RSSU5HLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cIlwiLyxcbiAgICAgICAgL15cIi4qP1teXFxcXF1cIi8sXG4gICAgICAgIC9eJycvLFxuICAgICAgICAvXicuKj9bXlxcXFxdJy9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkZJTFRFUixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFx8XFxzKihcXHcrKVxcKC9cbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkZJTFRFUkVNUFRZLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHxcXHMqKFxcdyspL1xuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuRlVOQ1RJT05FTVBUWSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFxzKihcXHcrKVxcKFxcKS9cbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkZVTkNUSU9OLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHMqKFxcdyspXFwoL1xuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuUEFSRU5PUEVOLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXCgvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5QQVJFTkNMT1NFLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXCkvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5DT01NQSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eLC9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkxPR0lDLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14oJiZ8XFx8XFx8KVxccyovLFxuICAgICAgICAvXihhbmR8b3IpXFxzKy9cbiAgICAgIF0sXG4gICAgICBpZHg6IDEsXG4gICAgICByZXBsYWNlOiB7XG4gICAgICAgICdhbmQnOiAnJiYnLFxuICAgICAgICAnb3InOiAnfHwnXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5DT01QQVJBVE9SLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14oPT09fD09fFxcIT09fFxcIT18PD18PHw+PXw+fGluXFxzfGd0ZVxcc3xndFxcc3xsdGVcXHN8bHRcXHMpXFxzKi9cbiAgICAgIF0sXG4gICAgICBpZHg6IDEsXG4gICAgICByZXBsYWNlOiB7XG4gICAgICAgICdndGUnOiAnPj0nLFxuICAgICAgICAnZ3QnOiAnPicsXG4gICAgICAgICdsdGUnOiAnPD0nLFxuICAgICAgICAnbHQnOiAnPCdcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkFTU0lHTk1FTlQsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXig9fFxcKz18LT18XFwqPXxcXC89KS9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLk5PVCxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFwhXFxzKi8sXG4gICAgICAgIC9ebm90XFxzKy9cbiAgICAgIF0sXG4gICAgICByZXBsYWNlOiB7XG4gICAgICAgICdub3QnOiAnISdcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkJPT0wsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXih0cnVlfGZhbHNlKVxccysvLFxuICAgICAgICAvXih0cnVlfGZhbHNlKSQvXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5WQVIsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlthLXpBLVpfJF1cXHcqKChcXC5cXHcqKSspPy8sXG4gICAgICAgIC9eW2EtekEtWl8kXVxcdyovXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5CUkFDS0VUT1BFTixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFxbL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQlJBQ0tFVENMT1NFLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXF0vXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5DVVJMWU9QRU4sXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcey9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkNPTE9OLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXDovXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5DVVJMWUNMT1NFLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXH0vXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5ET1RLRVksXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcLihcXHcrKS8sXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5OVU1CRVIsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlsrXFwtXT9cXGQrKFxcLlxcZCspPy9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLk9QRVJBVE9SLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14oXFwrfFxcLXxcXC98XFwqfCUpL1xuICAgICAgXVxuICAgIH1cbiAgXTtcblxuZXhwb3J0cy50eXBlcyA9IFRZUEVTO1xuXG4vKipcbiAqIFJldHVybiB0aGUgdG9rZW4gdHlwZSBvYmplY3QgZm9yIGEgc2luZ2xlIGNodW5rIG9mIGEgc3RyaW5nLlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHIgU3RyaW5nIGNodW5rLlxuICogQHJldHVybiB7TGV4ZXJUb2tlbn0gICAgIERlZmluZWQgdHlwZSwgcG90ZW50aWFsbHkgc3RyaXBwZWQgb3IgcmVwbGFjZWQgd2l0aCBtb3JlIHN1aXRhYmxlIGNvbnRlbnQuXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiByZWFkZXIoc3RyKSB7XG4gIHZhciBtYXRjaGVkO1xuXG4gIHV0aWxzLnNvbWUocnVsZXMsIGZ1bmN0aW9uIChydWxlKSB7XG4gICAgcmV0dXJuIHV0aWxzLnNvbWUocnVsZS5yZWdleCwgZnVuY3Rpb24gKHJlZ2V4KSB7XG4gICAgICB2YXIgbWF0Y2ggPSBzdHIubWF0Y2gocmVnZXgpLFxuICAgICAgICBub3JtYWxpemVkO1xuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbm9ybWFsaXplZCA9IG1hdGNoW3J1bGUuaWR4IHx8IDBdLnJlcGxhY2UoL1xccyokLywgJycpO1xuICAgICAgbm9ybWFsaXplZCA9IChydWxlLmhhc093blByb3BlcnR5KCdyZXBsYWNlJykgJiYgcnVsZS5yZXBsYWNlLmhhc093blByb3BlcnR5KG5vcm1hbGl6ZWQpKSA/IHJ1bGUucmVwbGFjZVtub3JtYWxpemVkXSA6IG5vcm1hbGl6ZWQ7XG5cbiAgICAgIG1hdGNoZWQgPSB7XG4gICAgICAgIG1hdGNoOiBub3JtYWxpemVkLFxuICAgICAgICB0eXBlOiBydWxlLnR5cGUsXG4gICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGlmICghbWF0Y2hlZCkge1xuICAgIG1hdGNoZWQgPSB7XG4gICAgICBtYXRjaDogc3RyLFxuICAgICAgdHlwZTogVFlQRVMuVU5LTk9XTixcbiAgICAgIGxlbmd0aDogc3RyLmxlbmd0aFxuICAgIH07XG4gIH1cblxuICByZXR1cm4gbWF0Y2hlZDtcbn1cblxuLyoqXG4gKiBSZWFkIGEgc3RyaW5nIGFuZCBicmVhayBpdCBpbnRvIHNlcGFyYXRlIHRva2VuIHR5cGVzLlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge0FycmF5LkxleGVyVG9rZW59ICAgICBBcnJheSBvZiBkZWZpbmVkIHR5cGVzLCBwb3RlbnRpYWxseSBzdHJpcHBlZCBvciByZXBsYWNlZCB3aXRoIG1vcmUgc3VpdGFibGUgY29udGVudC5cbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgdmFyIG9mZnNldCA9IDAsXG4gICAgdG9rZW5zID0gW10sXG4gICAgc3Vic3RyLFxuICAgIG1hdGNoO1xuICB3aGlsZSAob2Zmc2V0IDwgc3RyLmxlbmd0aCkge1xuICAgIHN1YnN0ciA9IHN0ci5zdWJzdHJpbmcob2Zmc2V0KTtcbiAgICBtYXRjaCA9IHJlYWRlcihzdWJzdHIpO1xuICAgIG9mZnNldCArPSBtYXRjaC5sZW5ndGg7XG4gICAgdG9rZW5zLnB1c2gobWF0Y2gpO1xuICB9XG4gIHJldHVybiB0b2tlbnM7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sZXhlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbi8qKlxuICogTG9hZHMgdGVtcGxhdGVzIGZyb20gdGhlIGZpbGUgc3lzdGVtLlxuICogQGFsaWFzIHN3aWcubG9hZGVycy5mc1xuICogQGV4YW1wbGVcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5mcygpIH0pO1xuICogQGV4YW1wbGVcbiAqIC8vIExvYWQgVGVtcGxhdGVzIGZyb20gYSBzcGVjaWZpYyBkaXJlY3RvcnkgKGRvZXMgbm90IHJlcXVpcmUgdXNpbmcgcmVsYXRpdmUgcGF0aHMgaW4geW91ciB0ZW1wbGF0ZXMpXG4gKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMuZnMoX19kaXJuYW1lICsgJy90ZW1wbGF0ZXMnICl9KTtcbiAqIEBwYXJhbSB7c3RyaW5nfSAgIFtiYXNlcGF0aD0nJ10gICAgIFBhdGggdG8gdGhlIHRlbXBsYXRlcyBhcyBzdHJpbmcuIEFzc2lnbmluZyB0aGlzIHZhbHVlIGFsbG93cyB5b3UgdG8gdXNlIHNlbWktYWJzb2x1dGUgcGF0aHMgdG8gdGVtcGxhdGVzIGluc3RlYWQgb2YgcmVsYXRpdmUgcGF0aHMuXG4gKiBAcGFyYW0ge3N0cmluZ30gICBbZW5jb2Rpbmc9J3V0ZjgnXSAgIFRlbXBsYXRlIGVuY29kaW5nXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2VwYXRoLCBlbmNvZGluZykge1xuICB2YXIgcmV0ID0ge307XG5cbiAgZW5jb2RpbmcgPSBlbmNvZGluZyB8fCAndXRmOCc7XG4gIGJhc2VwYXRoID0gKGJhc2VwYXRoKSA/IHBhdGgubm9ybWFsaXplKGJhc2VwYXRoKSA6IG51bGw7XG5cbiAgLyoqXG4gICAqIFJlc29sdmVzIDx2YXI+dG88L3Zhcj4gdG8gYW4gYWJzb2x1dGUgcGF0aCBvciB1bmlxdWUgaWRlbnRpZmllci4gVGhpcyBpcyB1c2VkIGZvciBidWlsZGluZyBjb3JyZWN0LCBub3JtYWxpemVkLCBhbmQgYWJzb2x1dGUgcGF0aHMgdG8gYSBnaXZlbiB0ZW1wbGF0ZS5cbiAgICogQGFsaWFzIHJlc29sdmVcbiAgICogQHBhcmFtICB7c3RyaW5nfSB0byAgICAgICAgTm9uLWFic29sdXRlIGlkZW50aWZpZXIgb3IgcGF0aG5hbWUgdG8gYSBmaWxlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IFtmcm9tXSAgICBJZiBnaXZlbiwgc2hvdWxkIGF0dGVtcHQgdG8gZmluZCB0aGUgPHZhcj50bzwvdmFyPiBwYXRoIGluIHJlbGF0aW9uIHRvIHRoaXMgZ2l2ZW4sIGtub3duIHBhdGguXG4gICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICovXG4gIHJldC5yZXNvbHZlID0gZnVuY3Rpb24gKHRvLCBmcm9tKSB7XG4gICAgaWYgKGJhc2VwYXRoKSB7XG4gICAgICBmcm9tID0gYmFzZXBhdGg7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZyb20gPSAoZnJvbSkgPyBwYXRoLmRpcm5hbWUoZnJvbSkgOiAnLyc7XG4gICAgfVxuICAgIHJldHVybiBwYXRoLnJlc29sdmUoZnJvbSwgdG8pO1xuICB9O1xuXG4gIC8qKlxuICAgKiBMb2FkcyBhIHNpbmdsZSB0ZW1wbGF0ZS4gR2l2ZW4gYSB1bmlxdWUgPHZhcj5pZGVudGlmaWVyPC92YXI+IGZvdW5kIGJ5IHRoZSA8dmFyPnJlc29sdmU8L3Zhcj4gbWV0aG9kIHRoaXMgc2hvdWxkIHJldHVybiB0aGUgZ2l2ZW4gdGVtcGxhdGUuXG4gICAqIEBhbGlhcyBsb2FkXG4gICAqIEBwYXJhbSAge3N0cmluZ30gICBpZGVudGlmaWVyICBVbmlxdWUgaWRlbnRpZmllciBvZiBhIHRlbXBsYXRlIChwb3NzaWJseSBhbiBhYnNvbHV0ZSBwYXRoKS5cbiAgICogQHBhcmFtICB7ZnVuY3Rpb259IFtjYl0gICAgICAgIEFzeW5jaHJvbm91cyBjYWxsYmFjayBmdW5jdGlvbi4gSWYgbm90IHByb3ZpZGVkLCB0aGlzIG1ldGhvZCBzaG91bGQgcnVuIHN5bmNocm9ub3VzbHkuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgICBUZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICAgKi9cbiAgcmV0LmxvYWQgPSBmdW5jdGlvbiAoaWRlbnRpZmllciwgY2IpIHtcbiAgICBpZiAoIWZzIHx8IChjYiAmJiAhZnMucmVhZEZpbGUpIHx8ICFmcy5yZWFkRmlsZVN5bmMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGZpbmQgZmlsZSAnICsgaWRlbnRpZmllciArICcgYmVjYXVzZSB0aGVyZSBpcyBubyBmaWxlc3lzdGVtIHRvIHJlYWQgZnJvbS4nKTtcbiAgICB9XG5cbiAgICBpZGVudGlmaWVyID0gcmV0LnJlc29sdmUoaWRlbnRpZmllcik7XG5cbiAgICBpZiAoY2IpIHtcbiAgICAgIGZzLnJlYWRGaWxlKGlkZW50aWZpZXIsIGVuY29kaW5nLCBjYik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldHVybiBmcy5yZWFkRmlsZVN5bmMoaWRlbnRpZmllciwgZW5jb2RpbmcpO1xuICB9O1xuXG4gIHJldHVybiByZXQ7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL2ZpbGVzeXN0ZW0uanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogQG5hbWVzcGFjZSBUZW1wbGF0ZUxvYWRlclxuICogQGRlc2NyaXB0aW9uIFN3aWcgaXMgYWJsZSB0byBhY2NlcHQgY3VzdG9tIHRlbXBsYXRlIGxvYWRlcnMgd3JpdHRlbiBieSB5b3UsIHNvIHRoYXQgeW91ciB0ZW1wbGF0ZXMgY2FuIGNvbWUgZnJvbSB5b3VyIGZhdm9yaXRlIHN0b3JhZ2UgbWVkaXVtIHdpdGhvdXQgbmVlZGluZyB0byBiZSBwYXJ0IG9mIHRoZSBjb3JlIGxpYnJhcnkuXG4gKiBBIHRlbXBsYXRlIGxvYWRlciBjb25zaXN0cyBvZiB0d28gbWV0aG9kczogPHZhcj5yZXNvbHZlPC92YXI+IGFuZCA8dmFyPmxvYWQ8L3Zhcj4uIEVhY2ggbWV0aG9kIGlzIHVzZWQgaW50ZXJuYWxseSBieSBTd2lnIHRvIGZpbmQgYW5kIGxvYWQgdGhlIHNvdXJjZSBvZiB0aGUgdGVtcGxhdGUgYmVmb3JlIGF0dGVtcHRpbmcgdG8gcGFyc2UgYW5kIGNvbXBpbGUgaXQuXG4gKiBAZXhhbXBsZVxuICogLy8gQSB0aGVvcmV0aWNhbCBtZW1jYWNoZWQgbG9hZGVyXG4gKiB2YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAqICAgTWVtY2FjaGVkID0gcmVxdWlyZSgnbWVtY2FjaGVkJyk7XG4gKiBmdW5jdGlvbiBtZW1jYWNoZWRMb2FkZXIobG9jYXRpb25zLCBvcHRpb25zKSB7XG4gKiAgIHZhciBtZW1jYWNoZWQgPSBuZXcgTWVtY2FjaGVkKGxvY2F0aW9ucywgb3B0aW9ucyk7XG4gKiAgIHJldHVybiB7XG4gKiAgICAgcmVzb2x2ZTogZnVuY3Rpb24gKHRvLCBmcm9tKSB7XG4gKiAgICAgICByZXR1cm4gcGF0aC5yZXNvbHZlKGZyb20sIHRvKTtcbiAqICAgICB9LFxuICogICAgIGxvYWQ6IGZ1bmN0aW9uIChpZGVudGlmaWVyLCBjYikge1xuICogICAgICAgbWVtY2FjaGVkLmdldChpZGVudGlmaWVyLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gKiAgICAgICAgIC8vIGlmICghZGF0YSkgeyBsb2FkIGZyb20gZmlsZXN5c3RlbTsgfVxuICogICAgICAgICBjYihlcnIsIGRhdGEpO1xuICogICAgICAgfSk7XG4gKiAgICAgfVxuICogICB9O1xuICogfTtcbiAqIC8vIFRlbGwgc3dpZyBhYm91dCB0aGUgbG9hZGVyOlxuICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogbWVtY2FjaGVkTG9hZGVyKFsnMTkyLjE2OC4wLjInXSkgfSk7XG4gKi9cblxuLyoqXG4gKiBAZnVuY3Rpb25cbiAqIEBuYW1lIHJlc29sdmVcbiAqIEBtZW1iZXJvZiBUZW1wbGF0ZUxvYWRlclxuICogQGRlc2NyaXB0aW9uXG4gKiBSZXNvbHZlcyA8dmFyPnRvPC92YXI+IHRvIGFuIGFic29sdXRlIHBhdGggb3IgdW5pcXVlIGlkZW50aWZpZXIuIFRoaXMgaXMgdXNlZCBmb3IgYnVpbGRpbmcgY29ycmVjdCwgbm9ybWFsaXplZCwgYW5kIGFic29sdXRlIHBhdGhzIHRvIGEgZ2l2ZW4gdGVtcGxhdGUuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHRvICAgICAgICBOb24tYWJzb2x1dGUgaWRlbnRpZmllciBvciBwYXRobmFtZSB0byBhIGZpbGUuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IFtmcm9tXSAgICBJZiBnaXZlbiwgc2hvdWxkIGF0dGVtcHQgdG8gZmluZCB0aGUgPHZhcj50bzwvdmFyPiBwYXRoIGluIHJlbGF0aW9uIHRvIHRoaXMgZ2l2ZW4sIGtub3duIHBhdGguXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cblxuLyoqXG4gKiBAZnVuY3Rpb25cbiAqIEBuYW1lIGxvYWRcbiAqIEBtZW1iZXJvZiBUZW1wbGF0ZUxvYWRlclxuICogQGRlc2NyaXB0aW9uXG4gKiBMb2FkcyBhIHNpbmdsZSB0ZW1wbGF0ZS4gR2l2ZW4gYSB1bmlxdWUgPHZhcj5pZGVudGlmaWVyPC92YXI+IGZvdW5kIGJ5IHRoZSA8dmFyPnJlc29sdmU8L3Zhcj4gbWV0aG9kIHRoaXMgc2hvdWxkIHJldHVybiB0aGUgZ2l2ZW4gdGVtcGxhdGUuXG4gKiBAcGFyYW0gIHtzdHJpbmd9ICAgaWRlbnRpZmllciAgVW5pcXVlIGlkZW50aWZpZXIgb2YgYSB0ZW1wbGF0ZSAocG9zc2libHkgYW4gYWJzb2x1dGUgcGF0aCkuXG4gKiBAcGFyYW0gIHtmdW5jdGlvbn0gW2NiXSAgICAgICAgQXN5bmNocm9ub3VzIGNhbGxiYWNrIGZ1bmN0aW9uLiBJZiBub3QgcHJvdmlkZWQsIHRoaXMgbWV0aG9kIHNob3VsZCBydW4gc3luY2hyb25vdXNseS5cbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgICBUZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICovXG5cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy5mcyA9IHJlcXVpcmUoJy4vZmlsZXN5c3RlbScpO1xuZXhwb3J0cy5tZW1vcnkgPSByZXF1aXJlKCcuL21lbW9yeScpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIExvYWRzIHRlbXBsYXRlcyBmcm9tIGEgcHJvdmlkZWQgb2JqZWN0IG1hcHBpbmcuXG4gKiBAYWxpYXMgc3dpZy5sb2FkZXJzLm1lbW9yeVxuICogQGV4YW1wbGVcbiAqIHZhciB0ZW1wbGF0ZXMgPSB7XG4gKiAgIFwibGF5b3V0XCI6IFwieyUgYmxvY2sgY29udGVudCAlfXslIGVuZGJsb2NrICV9XCIsXG4gKiAgIFwiaG9tZS5odG1sXCI6IFwieyUgZXh0ZW5kcyAnbGF5b3V0Lmh0bWwnICV9eyUgYmxvY2sgY29udGVudCAlfS4uLnslIGVuZGJsb2NrICV9XCJcbiAqIH07XG4gKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMubWVtb3J5KHRlbXBsYXRlcykgfSk7XG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG1hcHBpbmcgSGFzaCBvYmplY3Qgd2l0aCB0ZW1wbGF0ZSBwYXRocyBhcyBrZXlzIGFuZCB0ZW1wbGF0ZSBzb3VyY2VzIGFzIHZhbHVlcy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBbYmFzZXBhdGhdIFBhdGggdG8gdGhlIHRlbXBsYXRlcyBhcyBzdHJpbmcuIEFzc2lnbmluZyB0aGlzIHZhbHVlIGFsbG93cyB5b3UgdG8gdXNlIHNlbWktYWJzb2x1dGUgcGF0aHMgdG8gdGVtcGxhdGVzIGluc3RlYWQgb2YgcmVsYXRpdmUgcGF0aHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1hcHBpbmcsIGJhc2VwYXRoKSB7XG4gIHZhciByZXQgPSB7fTtcblxuICBiYXNlcGF0aCA9IChiYXNlcGF0aCkgPyBwYXRoLm5vcm1hbGl6ZShiYXNlcGF0aCkgOiBudWxsO1xuXG4gIC8qKlxuICAgKiBSZXNvbHZlcyA8dmFyPnRvPC92YXI+IHRvIGFuIGFic29sdXRlIHBhdGggb3IgdW5pcXVlIGlkZW50aWZpZXIuIFRoaXMgaXMgdXNlZCBmb3IgYnVpbGRpbmcgY29ycmVjdCwgbm9ybWFsaXplZCwgYW5kIGFic29sdXRlIHBhdGhzIHRvIGEgZ2l2ZW4gdGVtcGxhdGUuXG4gICAqIEBhbGlhcyByZXNvbHZlXG4gICAqIEBwYXJhbSAge3N0cmluZ30gdG8gICAgICAgIE5vbi1hYnNvbHV0ZSBpZGVudGlmaWVyIG9yIHBhdGhuYW1lIHRvIGEgZmlsZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBbZnJvbV0gICAgSWYgZ2l2ZW4sIHNob3VsZCBhdHRlbXB0IHRvIGZpbmQgdGhlIDx2YXI+dG88L3Zhcj4gcGF0aCBpbiByZWxhdGlvbiB0byB0aGlzIGdpdmVuLCBrbm93biBwYXRoLlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAqL1xuICByZXQucmVzb2x2ZSA9IGZ1bmN0aW9uICh0bywgZnJvbSkge1xuICAgIGlmIChiYXNlcGF0aCkge1xuICAgICAgZnJvbSA9IGJhc2VwYXRoO1xuICAgIH0gZWxzZSB7XG4gICAgICBmcm9tID0gKGZyb20pID8gcGF0aC5kaXJuYW1lKGZyb20pIDogJy8nO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKGZyb20sIHRvKTtcbiAgfTtcblxuICAvKipcbiAgICogTG9hZHMgYSBzaW5nbGUgdGVtcGxhdGUuIEdpdmVuIGEgdW5pcXVlIDx2YXI+aWRlbnRpZmllcjwvdmFyPiBmb3VuZCBieSB0aGUgPHZhcj5yZXNvbHZlPC92YXI+IG1ldGhvZCB0aGlzIHNob3VsZCByZXR1cm4gdGhlIGdpdmVuIHRlbXBsYXRlLlxuICAgKiBAYWxpYXMgbG9hZFxuICAgKiBAcGFyYW0gIHtzdHJpbmd9ICAgaWRlbnRpZmllciAgVW5pcXVlIGlkZW50aWZpZXIgb2YgYSB0ZW1wbGF0ZSAocG9zc2libHkgYW4gYWJzb2x1dGUgcGF0aCkuXG4gICAqIEBwYXJhbSAge2Z1bmN0aW9ufSBbY2JdICAgICAgICBBc3luY2hyb25vdXMgY2FsbGJhY2sgZnVuY3Rpb24uIElmIG5vdCBwcm92aWRlZCwgdGhpcyBtZXRob2Qgc2hvdWxkIHJ1biBzeW5jaHJvbm91c2x5LlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgICAgVGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAgICovXG4gIHJldC5sb2FkID0gZnVuY3Rpb24gKHBhdGhuYW1lLCBjYikge1xuICAgIHZhciBzcmMsIHBhdGhzO1xuXG4gICAgcGF0aHMgPSBbcGF0aG5hbWUsIHBhdGhuYW1lLnJlcGxhY2UoL14oXFwvfFxcXFwpLywgJycpXTtcblxuICAgIHNyYyA9IG1hcHBpbmdbcGF0aHNbMF1dIHx8IG1hcHBpbmdbcGF0aHNbMV1dO1xuICAgIGlmICghc3JjKSB7XG4gICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmFibGUgdG8gZmluZCB0ZW1wbGF0ZSBcIicgKyBwYXRobmFtZSArICdcIi4nKTtcbiAgICB9XG5cbiAgICBpZiAoY2IpIHtcbiAgICAgIGNiKG51bGwsIHNyYyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldHVybiBzcmM7XG4gIH07XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvbWVtb3J5LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyksXG4gIGxleGVyID0gcmVxdWlyZSgnLi9sZXhlcicpO1xuXG52YXIgX3QgPSBsZXhlci50eXBlcyxcbiAgX3Jlc2VydmVkID0gWydicmVhaycsICdjYXNlJywgJ2NhdGNoJywgJ2NvbnRpbnVlJywgJ2RlYnVnZ2VyJywgJ2RlZmF1bHQnLCAnZGVsZXRlJywgJ2RvJywgJ2Vsc2UnLCAnZmluYWxseScsICdmb3InLCAnZnVuY3Rpb24nLCAnaWYnLCAnaW4nLCAnaW5zdGFuY2VvZicsICduZXcnLCAncmV0dXJuJywgJ3N3aXRjaCcsICd0aGlzJywgJ3Rocm93JywgJ3RyeScsICd0eXBlb2YnLCAndmFyJywgJ3ZvaWQnLCAnd2hpbGUnLCAnd2l0aCddO1xuXG5cbi8qKlxuICogRmlsdGVycyBhcmUgc2ltcGx5IGZ1bmN0aW9ucyB0aGF0IHBlcmZvcm0gdHJhbnNmb3JtYXRpb25zIG9uIHRoZWlyIGZpcnN0IGlucHV0IGFyZ3VtZW50LlxuICogRmlsdGVycyBhcmUgcnVuIGF0IHJlbmRlciB0aW1lLCBzbyB0aGV5IG1heSBub3QgZGlyZWN0bHkgbW9kaWZ5IHRoZSBjb21waWxlZCB0ZW1wbGF0ZSBzdHJ1Y3R1cmUgaW4gYW55IHdheS5cbiAqIEFsbCBvZiBTd2lnJ3MgYnVpbHQtaW4gZmlsdGVycyBhcmUgd3JpdHRlbiBpbiB0aGlzIHNhbWUgd2F5LiBGb3IgbW9yZSBleGFtcGxlcywgcmVmZXJlbmNlIHRoZSBgZmlsdGVycy5qc2AgZmlsZSBpbiBTd2lnJ3Mgc291cmNlLlxuICpcbiAqIFRvIGRpc2FibGUgYXV0by1lc2NhcGluZyBvbiBhIGN1c3RvbSBmaWx0ZXIsIHNpbXBseSBhZGQgYSBwcm9wZXJ0eSB0byB0aGUgZmlsdGVyIG1ldGhvZCBgc2FmZSA9IHRydWU7YCBhbmQgdGhlIG91dHB1dCBmcm9tIHRoaXMgd2lsbCBub3QgYmUgZXNjYXBlZCwgbm8gbWF0dGVyIHdoYXQgdGhlIGdsb2JhbCBzZXR0aW5ncyBhcmUgZm9yIFN3aWcuXG4gKlxuICogQHR5cGVkZWYge2Z1bmN0aW9ufSBGaWx0ZXJcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gVGhpcyBmaWx0ZXIgd2lsbCByZXR1cm4gJ2JhemJvcCcgaWYgdGhlIGlkeCBvbiB0aGUgaW5wdXQgaXMgbm90ICdmb29iYXInXG4gKiBzd2lnLnNldEZpbHRlcignZm9vYmFyJywgZnVuY3Rpb24gKGlucHV0LCBpZHgpIHtcbiAqICAgcmV0dXJuIGlucHV0W2lkeF0gPT09ICdmb29iYXInID8gaW5wdXRbaWR4XSA6ICdiYXpib3AnO1xuICogfSk7XG4gKiAvLyBteXZhciA9IFsnZm9vJywgJ2JhcicsICdiYXonLCAnYm9wJ107XG4gKiAvLyA9PiB7eyBteXZhcnxmb29iYXIoMykgfX1cbiAqIC8vIFNpbmNlIG15dmFyWzNdICE9PSAnZm9vYmFyJywgd2UgcmVuZGVyOlxuICogLy8gPT4gYmF6Ym9wXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIFRoaXMgZmlsdGVyIHdpbGwgZGlzYWJsZSBhdXRvLWVzY2FwaW5nIG9uIGl0cyBvdXRwdXQ6XG4gKiBmdW5jdGlvbiBiYXpib3AgKGlucHV0KSB7IHJldHVybiBpbnB1dDsgfVxuICogYmF6Ym9wLnNhZmUgPSB0cnVlO1xuICogc3dpZy5zZXRGaWx0ZXIoJ2JhemJvcCcsIGJhemJvcCk7XG4gKiAvLyA9PiB7eyBcIjxwPlwifGJhemJvcCB9fVxuICogLy8gPT4gPHA+XG4gKlxuICogQHBhcmFtIHsqfSBpbnB1dCBJbnB1dCBhcmd1bWVudCwgYXV0b21hdGljYWxseSBzZW50IGZyb20gU3dpZydzIGJ1aWx0LWluIHBhcnNlci5cbiAqIEBwYXJhbSB7Li4uKn0gW2FyZ3NdIEFsbCBvdGhlciBhcmd1bWVudHMgYXJlIGRlZmluZWQgYnkgdGhlIEZpbHRlciBhdXRob3IuXG4gKiBAcmV0dXJuIHsqfVxuICovXG5cbi8qIVxuICogTWFrZXMgYSBzdHJpbmcgc2FmZSBmb3IgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN0clxuICogQHJldHVybiB7c3RyaW5nfVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHN0cikge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1tcXC1cXC9cXFxcXFxeJCorPy4oKXxcXFtcXF17fV0vZywgJ1xcXFwkJicpO1xufVxuXG4vKipcbiAqIFBhcnNlIHN0cmluZ3Mgb2YgdmFyaWFibGVzIGFuZCB0YWdzIGludG8gdG9rZW5zIGZvciBmdXR1cmUgY29tcGlsYXRpb24uXG4gKiBAY2xhc3NcbiAqIEBwYXJhbSB7YXJyYXl9ICAgdG9rZW5zICAgICBQcmUtc3BsaXQgdG9rZW5zIHJlYWQgYnkgdGhlIExleGVyLlxuICogQHBhcmFtIHtvYmplY3R9ICBmaWx0ZXJzICAgIEtleWVkIG9iamVjdCBvZiBmaWx0ZXJzIHRoYXQgbWF5IGJlIGFwcGxpZWQgdG8gdmFyaWFibGVzLlxuICogQHBhcmFtIHtib29sZWFufSBhdXRvZXNjYXBlIFdoZXRoZXIgb3Igbm90IHRoaXMgc2hvdWxkIGJlIGF1dG9lc2NhcGVkLlxuICogQHBhcmFtIHtudW1iZXJ9ICBsaW5lICAgICAgIEJlZ2lubmluZyBsaW5lIG51bWJlciBmb3IgdGhlIGZpcnN0IHRva2VuLlxuICogQHBhcmFtIHtzdHJpbmd9ICBbZmlsZW5hbWVdIE5hbWUgb2YgdGhlIGZpbGUgYmVpbmcgcGFyc2VkLlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gVG9rZW5QYXJzZXIodG9rZW5zLCBmaWx0ZXJzLCBhdXRvZXNjYXBlLCBsaW5lLCBmaWxlbmFtZSkge1xuICB0aGlzLm91dCA9IFtdO1xuICB0aGlzLnN0YXRlID0gW107XG4gIHRoaXMuZmlsdGVyQXBwbHlJZHggPSBbXTtcbiAgdGhpcy5fcGFyc2VycyA9IHt9O1xuICB0aGlzLmxpbmUgPSBsaW5lO1xuICB0aGlzLmZpbGVuYW1lID0gZmlsZW5hbWU7XG4gIHRoaXMuZmlsdGVycyA9IGZpbHRlcnM7XG4gIHRoaXMuZXNjYXBlID0gYXV0b2VzY2FwZTtcblxuICB0aGlzLnBhcnNlID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmIChzZWxmLl9wYXJzZXJzLnN0YXJ0KSB7XG4gICAgICBzZWxmLl9wYXJzZXJzLnN0YXJ0LmNhbGwoc2VsZik7XG4gICAgfVxuICAgIHV0aWxzLmVhY2godG9rZW5zLCBmdW5jdGlvbiAodG9rZW4sIGkpIHtcbiAgICAgIHZhciBwcmV2VG9rZW4gPSB0b2tlbnNbaSAtIDFdO1xuICAgICAgc2VsZi5pc0xhc3QgPSAoaSA9PT0gdG9rZW5zLmxlbmd0aCAtIDEpO1xuICAgICAgaWYgKHByZXZUb2tlbikge1xuICAgICAgICB3aGlsZSAocHJldlRva2VuLnR5cGUgPT09IF90LldISVRFU1BBQ0UpIHtcbiAgICAgICAgICBpIC09IDE7XG4gICAgICAgICAgcHJldlRva2VuID0gdG9rZW5zW2kgLSAxXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc2VsZi5wcmV2VG9rZW4gPSBwcmV2VG9rZW47XG4gICAgICBzZWxmLnBhcnNlVG9rZW4odG9rZW4pO1xuICAgIH0pO1xuICAgIGlmIChzZWxmLl9wYXJzZXJzLmVuZCkge1xuICAgICAgc2VsZi5fcGFyc2Vycy5lbmQuY2FsbChzZWxmKTtcbiAgICB9XG5cbiAgICBpZiAoc2VsZi5lc2NhcGUpIHtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHggPSBbMF07XG4gICAgICBpZiAodHlwZW9mIHNlbGYuZXNjYXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBzZWxmLnBhcnNlVG9rZW4oeyB0eXBlOiBfdC5GSUxURVIsIG1hdGNoOiAnZScgfSk7XG4gICAgICAgIHNlbGYucGFyc2VUb2tlbih7IHR5cGU6IF90LkNPTU1BLCBtYXRjaDogJywnIH0pO1xuICAgICAgICBzZWxmLnBhcnNlVG9rZW4oeyB0eXBlOiBfdC5TVFJJTkcsIG1hdGNoOiBTdHJpbmcoYXV0b2VzY2FwZSkgfSk7XG4gICAgICAgIHNlbGYucGFyc2VUb2tlbih7IHR5cGU6IF90LlBBUkVOQ0xPU0UsIG1hdGNoOiAnKSd9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYucGFyc2VUb2tlbih7IHR5cGU6IF90LkZJTFRFUkVNUFRZLCBtYXRjaDogJ2UnIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzZWxmLm91dDtcbiAgfTtcbn1cblxuVG9rZW5QYXJzZXIucHJvdG90eXBlID0ge1xuICAvKipcbiAgICogU2V0IGEgY3VzdG9tIG1ldGhvZCB0byBiZSBjYWxsZWQgd2hlbiBhIHRva2VuIHR5cGUgaXMgZm91bmQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHBhcnNlci5vbih0eXBlcy5TVFJJTkcsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgKiAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgKiB9KTtcbiAgICogQGV4YW1wbGVcbiAgICogcGFyc2VyLm9uKCdzdGFydCcsIGZ1bmN0aW9uICgpIHtcbiAgICogICB0aGlzLm91dC5wdXNoKCdzb21ldGhpbmcgYXQgdGhlIGJlZ2lubmluZyBvZiB5b3VyIGFyZ3MnKVxuICAgKiB9KTtcbiAgICogcGFyc2VyLm9uKCdlbmQnLCBmdW5jdGlvbiAoKSB7XG4gICAqICAgdGhpcy5vdXQucHVzaCgnc29tZXRoaW5nIGF0IHRoZSBlbmQgb2YgeW91ciBhcmdzJyk7XG4gICAqIH0pO1xuICAgKlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9ICAgdHlwZSBUb2tlbiB0eXBlIElELiBGb3VuZCBpbiB0aGUgTGV4ZXIuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgIENhbGxiYWNrIGZ1bmN0aW9uLiBSZXR1cm4gdHJ1ZSB0byBjb250aW51ZSBleGVjdXRpbmcgdGhlIGRlZmF1bHQgcGFyc2luZyBmdW5jdGlvbi5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKi9cbiAgb246IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIHRoaXMuX3BhcnNlcnNbdHlwZV0gPSBmbjtcbiAgfSxcblxuICAvKipcbiAgICogUGFyc2UgYSBzaW5nbGUgdG9rZW4uXG4gICAqIEBwYXJhbSAge3ttYXRjaDogc3RyaW5nLCB0eXBlOiBudW1iZXIsIGxpbmU6IG51bWJlcn19IHRva2VuIExleGVyIHRva2VuIG9iamVjdC5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcGFyc2VUb2tlbjogZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzLFxuICAgICAgZm4gPSBzZWxmLl9wYXJzZXJzW3Rva2VuLnR5cGVdIHx8IHNlbGYuX3BhcnNlcnNbJyonXSxcbiAgICAgIG1hdGNoID0gdG9rZW4ubWF0Y2gsXG4gICAgICBwcmV2VG9rZW4gPSBzZWxmLnByZXZUb2tlbixcbiAgICAgIHByZXZUb2tlblR5cGUgPSBwcmV2VG9rZW4gPyBwcmV2VG9rZW4udHlwZSA6IG51bGwsXG4gICAgICBsYXN0U3RhdGUgPSAoc2VsZi5zdGF0ZS5sZW5ndGgpID8gc2VsZi5zdGF0ZVtzZWxmLnN0YXRlLmxlbmd0aCAtIDFdIDogbnVsbCxcbiAgICAgIHRlbXA7XG5cbiAgICBpZiAoZm4gJiYgdHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBpZiAoIWZuLmNhbGwodGhpcywgdG9rZW4pKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGFzdFN0YXRlICYmIHByZXZUb2tlbiAmJlxuICAgICAgICBsYXN0U3RhdGUgPT09IF90LkZJTFRFUiAmJlxuICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5GSUxURVIgJiZcbiAgICAgICAgdG9rZW4udHlwZSAhPT0gX3QuUEFSRU5DTE9TRSAmJlxuICAgICAgICB0b2tlbi50eXBlICE9PSBfdC5DT01NQSAmJlxuICAgICAgICB0b2tlbi50eXBlICE9PSBfdC5PUEVSQVRPUiAmJlxuICAgICAgICB0b2tlbi50eXBlICE9PSBfdC5GSUxURVIgJiZcbiAgICAgICAgdG9rZW4udHlwZSAhPT0gX3QuRklMVEVSRU1QVFkpIHtcbiAgICAgIHNlbGYub3V0LnB1c2goJywgJyk7XG4gICAgfVxuXG4gICAgaWYgKGxhc3RTdGF0ZSAmJiBsYXN0U3RhdGUgPT09IF90Lk1FVEhPRE9QRU4pIHtcbiAgICAgIHNlbGYuc3RhdGUucG9wKCk7XG4gICAgICBpZiAodG9rZW4udHlwZSAhPT0gX3QuUEFSRU5DTE9TRSkge1xuICAgICAgICBzZWxmLm91dC5wdXNoKCcsICcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHN3aXRjaCAodG9rZW4udHlwZSkge1xuICAgIGNhc2UgX3QuV0hJVEVTUEFDRTpcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5TVFJJTkc6XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoKTtcbiAgICAgIHNlbGYub3V0LnB1c2gobWF0Y2gucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKSk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuTlVNQkVSOlxuICAgIGNhc2UgX3QuQk9PTDpcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGgpO1xuICAgICAgc2VsZi5vdXQucHVzaChtYXRjaCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuRklMVEVSOlxuICAgICAgaWYgKCFzZWxmLmZpbHRlcnMuaGFzT3duUHJvcGVydHkobWF0Y2gpIHx8IHR5cGVvZiBzZWxmLmZpbHRlcnNbbWF0Y2hdICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignSW52YWxpZCBmaWx0ZXIgXCInICsgbWF0Y2ggKyAnXCInLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5lc2NhcGUgPSBzZWxmLmZpbHRlcnNbbWF0Y2hdLnNhZmUgPyBmYWxzZSA6IHNlbGYuZXNjYXBlO1xuICAgICAgdGVtcCA9IHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBzZWxmLm91dC5zcGxpY2UodGVtcCwgMCwgJ19maWx0ZXJzW1wiJyArIG1hdGNoICsgJ1wiXSgnKTtcbiAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaCh0ZW1wKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5GSUxURVJFTVBUWTpcbiAgICAgIGlmICghc2VsZi5maWx0ZXJzLmhhc093blByb3BlcnR5KG1hdGNoKSB8fCB0eXBlb2Ygc2VsZi5maWx0ZXJzW21hdGNoXSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ0ludmFsaWQgZmlsdGVyIFwiJyArIG1hdGNoICsgJ1wiJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuZXNjYXBlID0gc2VsZi5maWx0ZXJzW21hdGNoXS5zYWZlID8gZmFsc2UgOiBzZWxmLmVzY2FwZTtcbiAgICAgIHNlbGYub3V0LnNwbGljZShzZWxmLmZpbHRlckFwcGx5SWR4W3NlbGYuZmlsdGVyQXBwbHlJZHgubGVuZ3RoIC0gMV0sIDAsICdfZmlsdGVyc1tcIicgKyBtYXRjaCArICdcIl0oJyk7XG4gICAgICBzZWxmLm91dC5wdXNoKCcpJyk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuRlVOQ1RJT046XG4gICAgY2FzZSBfdC5GVU5DVElPTkVNUFRZOlxuICAgICAgc2VsZi5vdXQucHVzaCgnKCh0eXBlb2YgX2N0eC4nICsgbWF0Y2ggKyAnICE9PSBcInVuZGVmaW5lZFwiKSA/IF9jdHguJyArIG1hdGNoICtcbiAgICAgICAgJyA6ICgodHlwZW9mICcgKyBtYXRjaCArICcgIT09IFwidW5kZWZpbmVkXCIpID8gJyArIG1hdGNoICtcbiAgICAgICAgJyA6IF9mbikpKCcpO1xuICAgICAgc2VsZi5lc2NhcGUgPSBmYWxzZTtcbiAgICAgIGlmICh0b2tlbi50eXBlID09PSBfdC5GVU5DVElPTkVNUFRZKSB7XG4gICAgICAgIHNlbGYub3V0W3NlbGYub3V0Lmxlbmd0aCAtIDFdID0gc2VsZi5vdXRbc2VsZi5vdXQubGVuZ3RoIC0gMV0gKyAnKSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICB9XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoIC0gMSk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuUEFSRU5PUEVOOlxuICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgaWYgKHNlbGYuZmlsdGVyQXBwbHlJZHgubGVuZ3RoKSB7XG4gICAgICAgIHNlbGYub3V0LnNwbGljZShzZWxmLmZpbHRlckFwcGx5SWR4W3NlbGYuZmlsdGVyQXBwbHlJZHgubGVuZ3RoIC0gMV0sIDAsICcoJyk7XG4gICAgICAgIGlmIChwcmV2VG9rZW4gJiYgcHJldlRva2VuVHlwZSA9PT0gX3QuVkFSKSB7XG4gICAgICAgICAgdGVtcCA9IHByZXZUb2tlbi5tYXRjaC5zcGxpdCgnLicpLnNsaWNlKDAsIC0xKTtcbiAgICAgICAgICBzZWxmLm91dC5wdXNoKCcgfHwgX2ZuKS5jYWxsKCcgKyBzZWxmLmNoZWNrTWF0Y2godGVtcCkpO1xuICAgICAgICAgIHNlbGYuc3RhdGUucHVzaChfdC5NRVRIT0RPUEVOKTtcbiAgICAgICAgICBzZWxmLmVzY2FwZSA9IGZhbHNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbGYub3V0LnB1c2goJyB8fCBfZm4pKCcpO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGggLSAzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYub3V0LnB1c2goJygnKTtcbiAgICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCAtIDEpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LlBBUkVOQ0xPU0U6XG4gICAgICB0ZW1wID0gc2VsZi5zdGF0ZS5wb3AoKTtcbiAgICAgIGlmICh0ZW1wICE9PSBfdC5QQVJFTk9QRU4gJiYgdGVtcCAhPT0gX3QuRlVOQ1RJT04gJiYgdGVtcCAhPT0gX3QuRklMVEVSKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ01pc21hdGNoZWQgbmVzdGluZyBzdGF0ZScsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCcpJyk7XG4gICAgICAvLyBPbmNlIG9mZiB0aGUgcHJldmlvdXMgZW50cnlcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICAvLyBPbmNlIGZvciB0aGUgb3BlbiBwYXJlblxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5DT01NQTpcbiAgICAgIGlmIChsYXN0U3RhdGUgIT09IF90LkZVTkNUSU9OICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSBfdC5GSUxURVIgJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IF90LkFSUkFZT1BFTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gX3QuQ1VSTFlPUEVOICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSBfdC5QQVJFTk9QRU4gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IF90LkNPTE9OKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgY29tbWEnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgaWYgKGxhc3RTdGF0ZSA9PT0gX3QuQ09MT04pIHtcbiAgICAgICAgc2VsZi5zdGF0ZS5wb3AoKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJywgJyk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkxPR0lDOlxuICAgIGNhc2UgX3QuQ09NUEFSQVRPUjpcbiAgICAgIGlmICghcHJldlRva2VuIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuQ09NTUEgfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSB0b2tlbi50eXBlIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuQlJBQ0tFVE9QRU4gfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5DVVJMWU9QRU4gfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5QQVJFTk9QRU4gfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5GVU5DVElPTikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGxvZ2ljJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90Lk5PVDpcbiAgICAgIHNlbGYub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LlZBUjpcbiAgICAgIHNlbGYucGFyc2VWYXIodG9rZW4sIG1hdGNoLCBsYXN0U3RhdGUpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkJSQUNLRVRPUEVOOlxuICAgICAgaWYgKCFwcmV2VG9rZW4gfHxcbiAgICAgICAgICAocHJldlRva2VuVHlwZSAhPT0gX3QuVkFSICYmXG4gICAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5CUkFDS0VUQ0xPU0UgJiZcbiAgICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LlBBUkVOQ0xPU0UpKSB7XG4gICAgICAgIHNlbGYuc3RhdGUucHVzaChfdC5BUlJBWU9QRU4pO1xuICAgICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJ1snKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5CUkFDS0VUQ0xPU0U6XG4gICAgICB0ZW1wID0gc2VsZi5zdGF0ZS5wb3AoKTtcbiAgICAgIGlmICh0ZW1wICE9PSBfdC5CUkFDS0VUT1BFTiAmJiB0ZW1wICE9PSBfdC5BUlJBWU9QRU4pIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBjbG9zaW5nIHNxdWFyZSBicmFja2V0Jywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJ10nKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQ1VSTFlPUEVOOlxuICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgc2VsZi5vdXQucHVzaCgneycpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCAtIDEpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkNPTE9OOlxuICAgICAgaWYgKGxhc3RTdGF0ZSAhPT0gX3QuQ1VSTFlPUEVOKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgY29sb24nLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgc2VsZi5vdXQucHVzaCgnOicpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5DVVJMWUNMT1NFOlxuICAgICAgaWYgKGxhc3RTdGF0ZSA9PT0gX3QuQ09MT04pIHtcbiAgICAgICAgc2VsZi5zdGF0ZS5wb3AoKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWxmLnN0YXRlLnBvcCgpICE9PSBfdC5DVVJMWU9QRU4pIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBjbG9zaW5nIGN1cmx5IGJyYWNlJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJ30nKTtcblxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5ET1RLRVk6XG4gICAgICBpZiAoIXByZXZUb2tlbiB8fCAoXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuVkFSICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuQlJBQ0tFVENMT1NFICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuRE9US0VZICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuUEFSRU5DTE9TRSAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkZVTkNUSU9ORU1QVFkgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5GSUxURVJFTVBUWSAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkNVUkxZQ0xPU0VcbiAgICAgICAgKSkge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGtleSBcIicgKyBtYXRjaCArICdcIicsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCcuJyArIG1hdGNoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5PUEVSQVRPUjpcbiAgICAgIHNlbGYub3V0LnB1c2goJyAnICsgbWF0Y2ggKyAnICcpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUGFyc2UgdmFyaWFibGUgdG9rZW5cbiAgICogQHBhcmFtICB7e21hdGNoOiBzdHJpbmcsIHR5cGU6IG51bWJlciwgbGluZTogbnVtYmVyfX0gdG9rZW4gICAgICBMZXhlciB0b2tlbiBvYmplY3QuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gbWF0Y2ggICAgICAgU2hvcnRjdXQgZm9yIHRva2VuLm1hdGNoXG4gICAqIEBwYXJhbSAge251bWJlcn0gbGFzdFN0YXRlICAgTGV4ZXIgdG9rZW4gdHlwZSBzdGF0ZS5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcGFyc2VWYXI6IGZ1bmN0aW9uICh0b2tlbiwgbWF0Y2gsIGxhc3RTdGF0ZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIG1hdGNoID0gbWF0Y2guc3BsaXQoJy4nKTtcblxuICAgIGlmIChfcmVzZXJ2ZWQuaW5kZXhPZihtYXRjaFswXSkgIT09IC0xKSB7XG4gICAgICB1dGlscy50aHJvd0Vycm9yKCdSZXNlcnZlZCBrZXl3b3JkIFwiJyArIG1hdGNoWzBdICsgJ1wiIGF0dGVtcHRlZCB0byBiZSB1c2VkIGFzIGEgdmFyaWFibGUnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgIH1cblxuICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGgpO1xuICAgIGlmIChsYXN0U3RhdGUgPT09IF90LkNVUkxZT1BFTikge1xuICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBkb3QnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaChtYXRjaFswXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2VsZi5vdXQucHVzaChzZWxmLmNoZWNrTWF0Y2gobWF0Y2gpKTtcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJuIGNvbnRleHR1YWwgZG90LWNoZWNrIHN0cmluZyBmb3IgYSBtYXRjaFxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IG1hdGNoICAgICAgIFNob3J0Y3V0IGZvciB0b2tlbi5tYXRjaFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgY2hlY2tNYXRjaDogZnVuY3Rpb24gKG1hdGNoKSB7XG4gICAgdmFyIHRlbXAgPSBtYXRjaFswXTtcblxuICAgIGZ1bmN0aW9uIGNoZWNrRG90KGN0eCkge1xuICAgICAgdmFyIGMgPSBjdHggKyB0ZW1wLFxuICAgICAgICBtID0gbWF0Y2gsXG4gICAgICAgIGJ1aWxkID0gJyc7XG5cbiAgICAgIGJ1aWxkID0gJyh0eXBlb2YgJyArIGMgKyAnICE9PSBcInVuZGVmaW5lZFwiJztcbiAgICAgIHV0aWxzLmVhY2gobSwgZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYnVpbGQgKz0gJyAmJiAnICsgYyArICcuJyArIHYgKyAnICE9PSB1bmRlZmluZWQnO1xuICAgICAgICBjICs9ICcuJyArIHY7XG4gICAgICB9KTtcbiAgICAgIGJ1aWxkICs9ICcpJztcblxuICAgICAgcmV0dXJuIGJ1aWxkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkRG90KGN0eCkge1xuICAgICAgcmV0dXJuICcoJyArIGNoZWNrRG90KGN0eCkgKyAnID8gJyArIGN0eCArIG1hdGNoLmpvaW4oJy4nKSArICcgOiBcIlwiKSc7XG4gICAgfVxuXG4gICAgcmV0dXJuICcoJyArIGNoZWNrRG90KCdfY3R4LicpICsgJyA/ICcgKyBidWlsZERvdCgnX2N0eC4nKSArICcgOiAnICsgYnVpbGREb3QoJycpICsgJyknO1xuICB9XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgc291cmNlIHN0cmluZyBpbnRvIHRva2VucyB0aGF0IGFyZSByZWFkeSBmb3IgY29tcGlsYXRpb24uXG4gKlxuICogQGV4YW1wbGVcbiAqIGV4cG9ydHMucGFyc2UoJ3t7IHRhY29zIH19Jywge30sIHRhZ3MsIGZpbHRlcnMpO1xuICogLy8gPT4gW3sgY29tcGlsZTogW0Z1bmN0aW9uXSwgLi4uIH1dXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBzb3VyY2UgIFN3aWcgdGVtcGxhdGUgc291cmNlLlxuICogQHBhcmFtICB7b2JqZWN0fSBvcHRzICAgIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0gIHtvYmplY3R9IHRhZ3MgICAgS2V5ZWQgb2JqZWN0IG9mIHRhZ3MgdGhhdCBjYW4gYmUgcGFyc2VkIGFuZCBjb21waWxlZC5cbiAqIEBwYXJhbSAge29iamVjdH0gZmlsdGVycyBLZXllZCBvYmplY3Qgb2YgZmlsdGVycyB0aGF0IG1heSBiZSBhcHBsaWVkIHRvIHZhcmlhYmxlcy5cbiAqIEByZXR1cm4ge2FycmF5fSAgICAgICAgICBMaXN0IG9mIHRva2VucyByZWFkeSBmb3IgY29tcGlsYXRpb24uXG4gKi9cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc291cmNlLCBvcHRzLCB0YWdzLCBmaWx0ZXJzKSB7XG4gIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKC9cXHJcXG4vZywgJ1xcbicpO1xuICB2YXIgZXNjYXBlID0gb3B0cy5hdXRvZXNjYXBlLFxuICAgIHRhZ09wZW4gPSBvcHRzLnRhZ0NvbnRyb2xzWzBdLFxuICAgIHRhZ0Nsb3NlID0gb3B0cy50YWdDb250cm9sc1sxXSxcbiAgICB2YXJPcGVuID0gb3B0cy52YXJDb250cm9sc1swXSxcbiAgICB2YXJDbG9zZSA9IG9wdHMudmFyQ29udHJvbHNbMV0sXG4gICAgZXNjYXBlZFRhZ09wZW4gPSBlc2NhcGVSZWdFeHAodGFnT3BlbiksXG4gICAgZXNjYXBlZFRhZ0Nsb3NlID0gZXNjYXBlUmVnRXhwKHRhZ0Nsb3NlKSxcbiAgICBlc2NhcGVkVmFyT3BlbiA9IGVzY2FwZVJlZ0V4cCh2YXJPcGVuKSxcbiAgICBlc2NhcGVkVmFyQ2xvc2UgPSBlc2NhcGVSZWdFeHAodmFyQ2xvc2UpLFxuICAgIHRhZ1N0cmlwID0gbmV3IFJlZ0V4cCgnXicgKyBlc2NhcGVkVGFnT3BlbiArICctP1xcXFxzKi0/fC0/XFxcXHMqLT8nICsgZXNjYXBlZFRhZ0Nsb3NlICsgJyQnLCAnZycpLFxuICAgIHRhZ1N0cmlwQmVmb3JlID0gbmV3IFJlZ0V4cCgnXicgKyBlc2NhcGVkVGFnT3BlbiArICctJyksXG4gICAgdGFnU3RyaXBBZnRlciA9IG5ldyBSZWdFeHAoJy0nICsgZXNjYXBlZFRhZ0Nsb3NlICsgJyQnKSxcbiAgICB2YXJTdHJpcCA9IG5ldyBSZWdFeHAoJ14nICsgZXNjYXBlZFZhck9wZW4gKyAnLT9cXFxccyotP3wtP1xcXFxzKi0/JyArIGVzY2FwZWRWYXJDbG9zZSArICckJywgJ2cnKSxcbiAgICB2YXJTdHJpcEJlZm9yZSA9IG5ldyBSZWdFeHAoJ14nICsgZXNjYXBlZFZhck9wZW4gKyAnLScpLFxuICAgIHZhclN0cmlwQWZ0ZXIgPSBuZXcgUmVnRXhwKCctJyArIGVzY2FwZWRWYXJDbG9zZSArICckJyksXG4gICAgY210T3BlbiA9IG9wdHMuY210Q29udHJvbHNbMF0sXG4gICAgY210Q2xvc2UgPSBvcHRzLmNtdENvbnRyb2xzWzFdLFxuICAgIGFueUNoYXIgPSAnW1xcXFxzXFxcXFNdKj8nLFxuICAgIC8vIFNwbGl0IHRoZSB0ZW1wbGF0ZSBzb3VyY2UgYmFzZWQgb24gdmFyaWFibGUsIHRhZywgYW5kIGNvbW1lbnQgYmxvY2tzXG4gICAgLy8gLyhcXHslW1xcc1xcU10qPyVcXH18XFx7XFx7W1xcc1xcU10qP1xcfVxcfXxcXHsjW1xcc1xcU10qPyNcXH0pL1xuICAgIHNwbGl0dGVyID0gbmV3IFJlZ0V4cChcbiAgICAgICcoJyArXG4gICAgICAgIGVzY2FwZWRUYWdPcGVuICsgYW55Q2hhciArIGVzY2FwZWRUYWdDbG9zZSArICd8JyArXG4gICAgICAgIGVzY2FwZWRWYXJPcGVuICsgYW55Q2hhciArIGVzY2FwZWRWYXJDbG9zZSArICd8JyArXG4gICAgICAgIGVzY2FwZVJlZ0V4cChjbXRPcGVuKSArIGFueUNoYXIgKyBlc2NhcGVSZWdFeHAoY210Q2xvc2UpICtcbiAgICAgICAgJyknXG4gICAgKSxcbiAgICBsaW5lID0gMSxcbiAgICBzdGFjayA9IFtdLFxuICAgIHBhcmVudCA9IG51bGwsXG4gICAgdG9rZW5zID0gW10sXG4gICAgYmxvY2tzID0ge30sXG4gICAgaW5SYXcgPSBmYWxzZSxcbiAgICBzdHJpcE5leHQ7XG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgdmFyaWFibGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc3RyICBTdHJpbmcgY29udGVudHMgb2YgdGhlIHZhcmlhYmxlLCBiZXR3ZWVuIDxpPnt7PC9pPiBhbmQgPGk+fX08L2k+XG4gICAqIEBwYXJhbSAge251bWJlcn0gbGluZSBUaGUgbGluZSBudW1iZXIgdGhhdCB0aGlzIHZhcmlhYmxlIHN0YXJ0cyBvbi5cbiAgICogQHJldHVybiB7VmFyVG9rZW59ICAgICAgUGFyc2VkIHZhcmlhYmxlIHRva2VuIG9iamVjdC5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIHBhcnNlVmFyaWFibGUoc3RyLCBsaW5lKSB7XG4gICAgdmFyIHRva2VucyA9IGxleGVyLnJlYWQodXRpbHMuc3RyaXAoc3RyKSksXG4gICAgICBwYXJzZXIsXG4gICAgICBvdXQ7XG5cbiAgICBwYXJzZXIgPSBuZXcgVG9rZW5QYXJzZXIodG9rZW5zLCBmaWx0ZXJzLCBlc2NhcGUsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgIG91dCA9IHBhcnNlci5wYXJzZSgpLmpvaW4oJycpO1xuXG4gICAgaWYgKHBhcnNlci5zdGF0ZS5sZW5ndGgpIHtcbiAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuYWJsZSB0byBwYXJzZSBcIicgKyBzdHIgKyAnXCInLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIHBhcnNlZCB2YXJpYWJsZSB0b2tlbi5cbiAgICAgKiBAdHlwZWRlZiB7b2JqZWN0fSBWYXJUb2tlblxuICAgICAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IGNvbXBpbGUgTWV0aG9kIGZvciBjb21waWxpbmcgdGhpcyB0b2tlbi5cbiAgICAgKi9cbiAgICByZXR1cm4ge1xuICAgICAgY29tcGlsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJ19vdXRwdXQgKz0gJyArIG91dCArICc7XFxuJztcbiAgICAgIH1cbiAgICB9O1xuICB9XG4gIGV4cG9ydHMucGFyc2VWYXJpYWJsZSA9IHBhcnNlVmFyaWFibGU7XG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgdGFnLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHN0ciAgU3RyaW5nIGNvbnRlbnRzIG9mIHRoZSB0YWcsIGJldHdlZW4gPGk+eyU8L2k+IGFuZCA8aT4lfTwvaT5cbiAgICogQHBhcmFtICB7bnVtYmVyfSBsaW5lIFRoZSBsaW5lIG51bWJlciB0aGF0IHRoaXMgdGFnIHN0YXJ0cyBvbi5cbiAgICogQHJldHVybiB7VGFnVG9rZW59ICAgICAgUGFyc2VkIHRva2VuIG9iamVjdC5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIHBhcnNlVGFnKHN0ciwgbGluZSkge1xuICAgIHZhciB0b2tlbnMsIHBhcnNlciwgY2h1bmtzLCB0YWdOYW1lLCB0YWcsIGFyZ3MsIGxhc3Q7XG5cbiAgICBpZiAodXRpbHMuc3RhcnRzV2l0aChzdHIsICdlbmQnKSkge1xuICAgICAgbGFzdCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKGxhc3QgJiYgbGFzdC5uYW1lID09PSBzdHIuc3BsaXQoL1xccysvKVswXS5yZXBsYWNlKC9eZW5kLywgJycpICYmIGxhc3QuZW5kcykge1xuICAgICAgICBzd2l0Y2ggKGxhc3QubmFtZSkge1xuICAgICAgICBjYXNlICdhdXRvZXNjYXBlJzpcbiAgICAgICAgICBlc2NhcGUgPSBvcHRzLmF1dG9lc2NhcGU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Jhdyc6XG4gICAgICAgICAgaW5SYXcgPSBmYWxzZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWluUmF3KSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgZW5kIG9mIHRhZyBcIicgKyBzdHIucmVwbGFjZSgvXmVuZC8sICcnKSArICdcIicsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpblJhdykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNodW5rcyA9IHN0ci5zcGxpdCgvXFxzKyguKyk/Lyk7XG4gICAgdGFnTmFtZSA9IGNodW5rcy5zaGlmdCgpO1xuXG4gICAgaWYgKCF0YWdzLmhhc093blByb3BlcnR5KHRhZ05hbWUpKSB7XG4gICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIHRhZyBcIicgKyBzdHIgKyAnXCInLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICB9XG5cbiAgICB0b2tlbnMgPSBsZXhlci5yZWFkKHV0aWxzLnN0cmlwKGNodW5rcy5qb2luKCcgJykpKTtcbiAgICBwYXJzZXIgPSBuZXcgVG9rZW5QYXJzZXIodG9rZW5zLCBmaWx0ZXJzLCBmYWxzZSwgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgdGFnID0gdGFnc1t0YWdOYW1lXTtcblxuICAgIC8qKlxuICAgICAqIERlZmluZSBjdXN0b20gcGFyc2luZyBtZXRob2RzIGZvciB5b3VyIHRhZy5cbiAgICAgKiBAY2FsbGJhY2sgcGFyc2VcbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIG9wdGlvbnMpIHtcbiAgICAgKiAgIHBhcnNlci5vbignc3RhcnQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICogICAgIC8vIC4uLlxuICAgICAqICAgfSk7XG4gICAgICogICBwYXJzZXIub24odHlwZXMuU1RSSU5HLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgKiAgICAgLy8gLi4uXG4gICAgICogICB9KTtcbiAgICAgKiB9O1xuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHN0ciBUaGUgZnVsbCB0b2tlbiBzdHJpbmcgb2YgdGhlIHRhZy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGluZSBUaGUgbGluZSBudW1iZXIgdGhhdCB0aGlzIHRhZyBhcHBlYXJzIG9uLlxuICAgICAqIEBwYXJhbSB7VG9rZW5QYXJzZXJ9IHBhcnNlciBBIFRva2VuUGFyc2VyIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSB7VFlQRVN9IHR5cGVzIExleGVyIHRva2VuIHR5cGUgZW51bS5cbiAgICAgKiBAcGFyYW0ge1RhZ1Rva2VuW119IHN0YWNrIFRoZSBjdXJyZW50IHN0YWNrIG9mIG9wZW4gdGFncy5cbiAgICAgKiBAcGFyYW0ge1N3aWdPcHRzfSBvcHRpb25zIFN3aWcgT3B0aW9ucyBPYmplY3QuXG4gICAgICovXG4gICAgaWYgKCF0YWcucGFyc2UoY2h1bmtzWzFdLCBsaW5lLCBwYXJzZXIsIF90LCBzdGFjaywgb3B0cykpIHtcbiAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgdGFnIFwiJyArIHRhZ05hbWUgKyAnXCInLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICB9XG5cbiAgICBwYXJzZXIucGFyc2UoKTtcbiAgICBhcmdzID0gcGFyc2VyLm91dDtcblxuICAgIHN3aXRjaCAodGFnTmFtZSkge1xuICAgIGNhc2UgJ2F1dG9lc2NhcGUnOlxuICAgICAgZXNjYXBlID0gKGFyZ3NbMF0gIT09ICdmYWxzZScpID8gYXJnc1swXSA6IGZhbHNlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIGluUmF3ID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcGFyc2VkIHRhZyB0b2tlbi5cbiAgICAgKiBAdHlwZWRlZiB7T2JqZWN0fSBUYWdUb2tlblxuICAgICAqIEBwcm9wZXJ0eSB7Y29tcGlsZX0gW2NvbXBpbGVdIE1ldGhvZCBmb3IgY29tcGlsaW5nIHRoaXMgdG9rZW4uXG4gICAgICogQHByb3BlcnR5IHthcnJheX0gW2FyZ3NdIEFycmF5IG9mIGFyZ3VtZW50cyBmb3IgdGhlIHRhZy5cbiAgICAgKiBAcHJvcGVydHkge1Rva2VuW119IFtjb250ZW50PVtdXSBBbiBhcnJheSBvZiB0b2tlbnMgdGhhdCBhcmUgY2hpbGRyZW4gb2YgdGhpcyBUb2tlbi5cbiAgICAgKiBAcHJvcGVydHkge2Jvb2xlYW59IFtlbmRzXSBXaGV0aGVyIG9yIG5vdCB0aGlzIHRhZyByZXF1aXJlcyBhbiBlbmQgdGFnLlxuICAgICAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoaXMgdGFnLlxuICAgICAqL1xuICAgIHJldHVybiB7XG4gICAgICBibG9jazogISF0YWdzW3RhZ05hbWVdLmJsb2NrLFxuICAgICAgY29tcGlsZTogdGFnLmNvbXBpbGUsXG4gICAgICBhcmdzOiBhcmdzLFxuICAgICAgY29udGVudDogW10sXG4gICAgICBlbmRzOiB0YWcuZW5kcyxcbiAgICAgIG5hbWU6IHRhZ05hbWVcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0cmlwIHRoZSB3aGl0ZXNwYWNlIGZyb20gdGhlIHByZXZpb3VzIHRva2VuLCBpZiBpdCBpcyBhIHN0cmluZy5cbiAgICogQHBhcmFtICB7b2JqZWN0fSB0b2tlbiBQYXJzZWQgdG9rZW4uXG4gICAqIEByZXR1cm4ge29iamVjdH0gICAgICAgSWYgdGhlIHRva2VuIHdhcyBhIHN0cmluZywgdHJhaWxpbmcgd2hpdGVzcGFjZSB3aWxsIGJlIHN0cmlwcGVkLlxuICAgKi9cbiAgZnVuY3Rpb24gc3RyaXBQcmV2VG9rZW4odG9rZW4pIHtcbiAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgdG9rZW4gPSB0b2tlbi5yZXBsYWNlKC9cXHMqJC8sICcnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2VuO1xuICB9XG5cbiAgLyohXG4gICAqIExvb3Agb3ZlciB0aGUgc291cmNlLCBzcGxpdCB2aWEgdGhlIHRhZy92YXIvY29tbWVudCByZWd1bGFyIGV4cHJlc3Npb24gc3BsaXR0ZXIuXG4gICAqIFNlbmQgZWFjaCBjaHVuayB0byB0aGUgYXBwcm9wcmlhdGUgcGFyc2VyLlxuICAgKi9cbiAgdXRpbHMuZWFjaChzb3VyY2Uuc3BsaXQoc3BsaXR0ZXIpLCBmdW5jdGlvbiAoY2h1bmspIHtcbiAgICB2YXIgdG9rZW4sIGxpbmVzLCBzdHJpcFByZXYsIHByZXZUb2tlbiwgcHJldkNoaWxkVG9rZW47XG5cbiAgICBpZiAoIWNodW5rKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSXMgYSB2YXJpYWJsZT9cbiAgICBpZiAoIWluUmF3ICYmIHV0aWxzLnN0YXJ0c1dpdGgoY2h1bmssIHZhck9wZW4pICYmIHV0aWxzLmVuZHNXaXRoKGNodW5rLCB2YXJDbG9zZSkpIHtcbiAgICAgIHN0cmlwUHJldiA9IHZhclN0cmlwQmVmb3JlLnRlc3QoY2h1bmspO1xuICAgICAgc3RyaXBOZXh0ID0gdmFyU3RyaXBBZnRlci50ZXN0KGNodW5rKTtcbiAgICAgIHRva2VuID0gcGFyc2VWYXJpYWJsZShjaHVuay5yZXBsYWNlKHZhclN0cmlwLCAnJyksIGxpbmUpO1xuICAgIC8vIElzIGEgdGFnP1xuICAgIH0gZWxzZSBpZiAodXRpbHMuc3RhcnRzV2l0aChjaHVuaywgdGFnT3BlbikgJiYgdXRpbHMuZW5kc1dpdGgoY2h1bmssIHRhZ0Nsb3NlKSkge1xuICAgICAgc3RyaXBQcmV2ID0gdGFnU3RyaXBCZWZvcmUudGVzdChjaHVuayk7XG4gICAgICBzdHJpcE5leHQgPSB0YWdTdHJpcEFmdGVyLnRlc3QoY2h1bmspO1xuICAgICAgdG9rZW4gPSBwYXJzZVRhZyhjaHVuay5yZXBsYWNlKHRhZ1N0cmlwLCAnJyksIGxpbmUpO1xuICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgIGlmICh0b2tlbi5uYW1lID09PSAnZXh0ZW5kcycpIHtcbiAgICAgICAgICBwYXJlbnQgPSB0b2tlbi5hcmdzLmpvaW4oJycpLnJlcGxhY2UoL15cXCd8XFwnJC9nLCAnJykucmVwbGFjZSgvXlxcXCJ8XFxcIiQvZywgJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRva2VuLmJsb2NrICYmICghc3RhY2subGVuZ3RoIHx8IHRva2VuLm5hbWUgPT09ICdibG9jaycpKSB7XG4gICAgICAgICAgYmxvY2tzW3Rva2VuLmFyZ3Muam9pbignJyldID0gdG9rZW47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpblJhdyAmJiAhdG9rZW4pIHtcbiAgICAgICAgdG9rZW4gPSBjaHVuaztcbiAgICAgIH1cbiAgICAvLyBJcyBhIGNvbnRlbnQgc3RyaW5nP1xuICAgIH0gZWxzZSBpZiAoaW5SYXcgfHwgKCF1dGlscy5zdGFydHNXaXRoKGNodW5rLCBjbXRPcGVuKSAmJiAhdXRpbHMuZW5kc1dpdGgoY2h1bmssIGNtdENsb3NlKSkpIHtcbiAgICAgIHRva2VuID0gKHN0cmlwTmV4dCkgPyBjaHVuay5yZXBsYWNlKC9eXFxzKi8sICcnKSA6IGNodW5rO1xuICAgICAgc3RyaXBOZXh0ID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmICh1dGlscy5zdGFydHNXaXRoKGNodW5rLCBjbXRPcGVuKSAmJiB1dGlscy5lbmRzV2l0aChjaHVuaywgY210Q2xvc2UpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRGlkIHRoaXMgdGFnIGFzayB0byBzdHJpcCBwcmV2aW91cyB3aGl0ZXNwYWNlPyA8Y29kZT57JS0gLi4uICV9PC9jb2RlPiBvciA8Y29kZT57ey0gLi4uIH19PC9jb2RlPlxuICAgIGlmIChzdHJpcFByZXYgJiYgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgcHJldlRva2VuID0gdG9rZW5zLnBvcCgpO1xuICAgICAgaWYgKHR5cGVvZiBwcmV2VG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHByZXZUb2tlbiA9IHN0cmlwUHJldlRva2VuKHByZXZUb2tlbik7XG4gICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi5jb250ZW50ICYmIHByZXZUb2tlbi5jb250ZW50Lmxlbmd0aCkge1xuICAgICAgICBwcmV2Q2hpbGRUb2tlbiA9IHN0cmlwUHJldlRva2VuKHByZXZUb2tlbi5jb250ZW50LnBvcCgpKTtcbiAgICAgICAgcHJldlRva2VuLmNvbnRlbnQucHVzaChwcmV2Q2hpbGRUb2tlbik7XG4gICAgICB9XG4gICAgICB0b2tlbnMucHVzaChwcmV2VG9rZW4pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgd2FzIGEgY29tbWVudCwgc28gbGV0J3MganVzdCBrZWVwIGdvaW5nLlxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJZiB0aGVyZSdzIGFuIG9wZW4gaXRlbSBpbiB0aGUgc3RhY2ssIGFkZCB0aGlzIHRvIGl0cyBjb250ZW50LlxuICAgIGlmIChzdGFjay5sZW5ndGgpIHtcbiAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLmNvbnRlbnQucHVzaCh0b2tlbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRva2Vucy5wdXNoKHRva2VuKTtcbiAgICB9XG5cbiAgICAvLyBJZiB0aGUgdG9rZW4gaXMgYSB0YWcgdGhhdCByZXF1aXJlcyBhbiBlbmQgdGFnLCBvcGVuIGl0IG9uIHRoZSBzdGFjay5cbiAgICBpZiAodG9rZW4ubmFtZSAmJiB0b2tlbi5lbmRzKSB7XG4gICAgICBzdGFjay5wdXNoKHRva2VuKTtcbiAgICB9XG5cbiAgICBsaW5lcyA9IGNodW5rLm1hdGNoKC9cXG4vZyk7XG4gICAgbGluZSArPSAobGluZXMpID8gbGluZXMubGVuZ3RoIDogMDtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBvcHRzLmZpbGVuYW1lLFxuICAgIHBhcmVudDogcGFyZW50LFxuICAgIHRva2VuczogdG9rZW5zLFxuICAgIGJsb2NrczogYmxvY2tzXG4gIH07XG59O1xuXG5cbi8qKlxuICogQ29tcGlsZSBhbiBhcnJheSBvZiB0b2tlbnMuXG4gKiBAcGFyYW0gIHtUb2tlbltdfSB0ZW1wbGF0ZSAgICAgQW4gYXJyYXkgb2YgdGVtcGxhdGUgdG9rZW5zLlxuICogQHBhcmFtICB7VGVtcGxhdGVzW119IHBhcmVudHMgIEFycmF5IG9mIHBhcmVudCB0ZW1wbGF0ZXMuXG4gKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnNdICAgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSAge3N0cmluZ30gW2Jsb2NrTmFtZV0gICBOYW1lIG9mIHRoZSBjdXJyZW50IGJsb2NrIGNvbnRleHQuXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgICAgUGFydGlhbCBmb3IgYSBjb21waWxlZCBKYXZhU2NyaXB0IG1ldGhvZCB0aGF0IHdpbGwgb3V0cHV0IGEgcmVuZGVyZWQgdGVtcGxhdGUuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uICh0ZW1wbGF0ZSwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHZhciBvdXQgPSAnJyxcbiAgICB0b2tlbnMgPSB1dGlscy5pc0FycmF5KHRlbXBsYXRlKSA/IHRlbXBsYXRlIDogdGVtcGxhdGUudG9rZW5zO1xuXG4gIHV0aWxzLmVhY2godG9rZW5zLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB2YXIgbztcbiAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgb3V0ICs9ICdfb3V0cHV0ICs9IFwiJyArIHRva2VuLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXFxufFxcci9nLCAnXFxcXG4nKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJykgKyAnXCI7XFxuJztcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21waWxlIGNhbGxiYWNrIGZvciBWYXJUb2tlbiBhbmQgVGFnVG9rZW4gb2JqZWN0cy5cbiAgICAgKiBAY2FsbGJhY2sgY29tcGlsZVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBleHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICAgICAqICAgaWYgKGFyZ3NbMF0gPT09ICdmb28nKSB7XG4gICAgICogICAgIHJldHVybiBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpICsgJ1xcbic7XG4gICAgICogICB9XG4gICAgICogICByZXR1cm4gJ19vdXRwdXQgKz0gXCJmYWxsYmFja1wiO1xcbic7XG4gICAgICogfTtcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7cGFyc2VyQ29tcGlsZXJ9IGNvbXBpbGVyXG4gICAgICogQHBhcmFtIHthcnJheX0gW2FyZ3NdIEFycmF5IG9mIHBhcnNlZCBhcmd1bWVudHMgb24gdGhlIGZvciB0aGUgdG9rZW4uXG4gICAgICogQHBhcmFtIHthcnJheX0gW2NvbnRlbnRdIEFycmF5IG9mIGNvbnRlbnQgd2l0aGluIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2FycmF5fSBbcGFyZW50c10gQXJyYXkgb2YgcGFyZW50IHRlbXBsYXRlcyBmb3IgdGhlIGN1cnJlbnQgdGVtcGxhdGUgY29udGV4dC5cbiAgICAgKiBAcGFyYW0ge1N3aWdPcHRzfSBbb3B0aW9uc10gU3dpZyBPcHRpb25zIE9iamVjdFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbYmxvY2tOYW1lXSBOYW1lIG9mIHRoZSBkaXJlY3QgYmxvY2sgcGFyZW50LCBpZiBhbnkuXG4gICAgICovXG4gICAgbyA9IHRva2VuLmNvbXBpbGUoZXhwb3J0cy5jb21waWxlLCB0b2tlbi5hcmdzID8gdG9rZW4uYXJncy5zbGljZSgwKSA6IFtdLCB0b2tlbi5jb250ZW50ID8gdG9rZW4uY29udGVudC5zbGljZSgwKSA6IFtdLCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpO1xuICAgIG91dCArPSBvIHx8ICcnO1xuICB9KTtcblxuICByZXR1cm4gb3V0O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvcGFyc2VyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpLFxuICBfdGFncyA9IHJlcXVpcmUoJy4vdGFncycpLFxuICBfZmlsdGVycyA9IHJlcXVpcmUoJy4vZmlsdGVycycpLFxuICBwYXJzZXIgPSByZXF1aXJlKCcuL3BhcnNlcicpLFxuICBkYXRlZm9ybWF0dGVyID0gcmVxdWlyZSgnLi9kYXRlZm9ybWF0dGVyJyksXG4gIGxvYWRlcnMgPSByZXF1aXJlKCcuL2xvYWRlcnMnKTtcblxuLyoqXG4gKiBTd2lnIHZlcnNpb24gbnVtYmVyIGFzIGEgc3RyaW5nLlxuICogQGV4YW1wbGVcbiAqIGlmIChzd2lnLnZlcnNpb24gPT09IFwiMS4zLjJcIikgeyAuLi4gfVxuICpcbiAqIEB0eXBlIHtTdHJpbmd9XG4gKi9cbmV4cG9ydHMudmVyc2lvbiA9IFwiMS4zLjJcIjtcblxuLyoqXG4gKiBTd2lnIE9wdGlvbnMgT2JqZWN0LiBUaGlzIG9iamVjdCBjYW4gYmUgcGFzc2VkIHRvIG1hbnkgb2YgdGhlIEFQSS1sZXZlbCBTd2lnIG1ldGhvZHMgdG8gY29udHJvbCB2YXJpb3VzIGFzcGVjdHMgb2YgdGhlIGVuZ2luZS4gQWxsIGtleXMgYXJlIG9wdGlvbmFsLlxuICogQHR5cGVkZWYge09iamVjdH0gU3dpZ09wdHNcbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gYXV0b2VzY2FwZSAgQ29udHJvbHMgd2hldGhlciBvciBub3QgdmFyaWFibGUgb3V0cHV0IHdpbGwgYXV0b21hdGljYWxseSBiZSBlc2NhcGVkIGZvciBzYWZlIEhUTUwgb3V0cHV0LiBEZWZhdWx0cyB0byA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj50cnVlPC9jb2RlPi4gRnVuY3Rpb25zIGV4ZWN1dGVkIGluIHZhcmlhYmxlIHN0YXRlbWVudHMgd2lsbCBub3QgYmUgYXV0by1lc2NhcGVkLiBZb3VyIGFwcGxpY2F0aW9uL2Z1bmN0aW9ucyBzaG91bGQgdGFrZSBjYXJlIG9mIHRoZWlyIG93biBhdXRvLWVzY2FwaW5nLlxuICogQHByb3BlcnR5IHthcnJheX0gICB2YXJDb250cm9scyBPcGVuIGFuZCBjbG9zZSBjb250cm9scyBmb3IgdmFyaWFibGVzLiBEZWZhdWx0cyB0byA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5bJ3t7JywgJ319J108L2NvZGU+LlxuICogQHByb3BlcnR5IHthcnJheX0gICB0YWdDb250cm9scyBPcGVuIGFuZCBjbG9zZSBjb250cm9scyBmb3IgdGFncy4gRGVmYXVsdHMgdG8gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+Wyd7JScsICclfSddPC9jb2RlPi5cbiAqIEBwcm9wZXJ0eSB7YXJyYXl9ICAgY210Q29udHJvbHMgT3BlbiBhbmQgY2xvc2UgY29udHJvbHMgZm9yIGNvbW1lbnRzLiBEZWZhdWx0cyB0byA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5bJ3sjJywgJyN9J108L2NvZGU+LlxuICogQHByb3BlcnR5IHtvYmplY3R9ICBsb2NhbHMgICAgICBEZWZhdWx0IHZhcmlhYmxlIGNvbnRleHQgdG8gYmUgcGFzc2VkIHRvIDxzdHJvbmc+YWxsPC9zdHJvbmc+IHRlbXBsYXRlcy5cbiAqIEBwcm9wZXJ0eSB7Q2FjaGVPcHRpb25zfSBjYWNoZSBDYWNoZSBjb250cm9sIGZvciB0ZW1wbGF0ZXMuIERlZmF1bHRzIHRvIHNhdmluZyBpbiA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj4nbWVtb3J5JzwvY29kZT4uIFNlbmQgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+ZmFsc2U8L2NvZGU+IHRvIGRpc2FibGUuIFNlbmQgYW4gb2JqZWN0IHdpdGggPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+Z2V0PC9jb2RlPiBhbmQgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+c2V0PC9jb2RlPiBmdW5jdGlvbnMgdG8gY3VzdG9taXplLlxuICogQHByb3BlcnR5IHtUZW1wbGF0ZUxvYWRlcn0gbG9hZGVyIFRoZSBtZXRob2QgdGhhdCBTd2lnIHdpbGwgdXNlIHRvIGxvYWQgdGVtcGxhdGVzLiBEZWZhdWx0cyB0byA8dmFyPnN3aWcubG9hZGVycy5mczwvdmFyPi5cbiAqL1xudmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgIGF1dG9lc2NhcGU6IHRydWUsXG4gICAgdmFyQ29udHJvbHM6IFsne3snLCAnfX0nXSxcbiAgICB0YWdDb250cm9sczogWyd7JScsICclfSddLFxuICAgIGNtdENvbnRyb2xzOiBbJ3sjJywgJyN9J10sXG4gICAgbG9jYWxzOiB7fSxcbiAgICAvKipcbiAgICAgKiBDYWNoZSBjb250cm9sIGZvciB0ZW1wbGF0ZXMuIERlZmF1bHRzIHRvIHNhdmluZyBhbGwgdGVtcGxhdGVzIGludG8gbWVtb3J5LlxuICAgICAqIEB0eXBlZGVmIHtib29sZWFufHN0cmluZ3xvYmplY3R9IENhY2hlT3B0aW9uc1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRGVmYXVsdFxuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoeyBjYWNoZTogJ21lbW9yeScgfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBEaXNhYmxlcyBjYWNoaW5nIGluIFN3aWcuXG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7IGNhY2hlOiBmYWxzZSB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEN1c3RvbSBjYWNoZSBzdG9yYWdlIGFuZCByZXRyaWV2YWxcbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHtcbiAgICAgKiAgIGNhY2hlOiB7XG4gICAgICogICAgIGdldDogZnVuY3Rpb24gKGtleSkgeyAuLi4gfSxcbiAgICAgKiAgICAgc2V0OiBmdW5jdGlvbiAoa2V5LCB2YWwpIHsgLi4uIH1cbiAgICAgKiAgIH1cbiAgICAgKiB9KTtcbiAgICAgKi9cbiAgICBjYWNoZTogJ21lbW9yeScsXG4gICAgLyoqXG4gICAgICogQ29uZmlndXJlIFN3aWcgdG8gdXNlIGVpdGhlciB0aGUgPHZhcj5zd2lnLmxvYWRlcnMuZnM8L3Zhcj4gb3IgPHZhcj5zd2lnLmxvYWRlcnMubWVtb3J5PC92YXI+IHRlbXBsYXRlIGxvYWRlci4gT3IsIHlvdSBjYW4gd3JpdGUgeW91ciBvd24hXG4gICAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24sIHBsZWFzZSBzZWUgdGhlIDxhIGhyZWY9XCIuLi9sb2FkZXJzL1wiPlRlbXBsYXRlIExvYWRlcnMgZG9jdW1lbnRhdGlvbjwvYT4uXG4gICAgICogQHR5cGVkZWYge2NsYXNzfSBUZW1wbGF0ZUxvYWRlclxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRGVmYXVsdCwgRmlsZVN5c3RlbSBsb2FkZXJcbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMuZnMoKSB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEZpbGVTeXN0ZW0gbG9hZGVyIGFsbG93aW5nIGEgYmFzZSBwYXRoXG4gICAgICogLy8gV2l0aCB0aGlzLCB5b3UgZG9uJ3QgdXNlIHJlbGF0aXZlIFVSTHMgaW4geW91ciB0ZW1wbGF0ZSByZWZlcmVuY2VzXG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLmZzKF9fZGlybmFtZSArICcvdGVtcGxhdGVzJykgfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBNZW1vcnkgTG9hZGVyXG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLm1lbW9yeSh7XG4gICAgICogICBsYXlvdXQ6ICd7JSBibG9jayBmb28gJX17JSBlbmRibG9jayAlfScsXG4gICAgICogICBwYWdlMTogJ3slIGV4dGVuZHMgXCJsYXlvdXRcIiAlfXslIGJsb2NrIGZvbyAlfVRhY29zIXslIGVuZGJsb2NrICV9J1xuICAgICAqIH0pfSk7XG4gICAgICovXG4gICAgbG9hZGVyOiBsb2FkZXJzLmZzKClcbiAgfSxcbiAgZGVmYXVsdEluc3RhbmNlO1xuXG4vKipcbiAqIEVtcHR5IGZ1bmN0aW9uLCB1c2VkIGluIHRlbXBsYXRlcy5cbiAqIEByZXR1cm4ge3N0cmluZ30gRW1wdHkgc3RyaW5nXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlZm4oKSB7IHJldHVybiAnJzsgfVxuXG4vKipcbiAqIFZhbGlkYXRlIHRoZSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtICB7P1N3aWdPcHRzfSBvcHRpb25zIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcmV0dXJuIHt1bmRlZmluZWR9ICAgICAgVGhpcyBtZXRob2Qgd2lsbCB0aHJvdyBlcnJvcnMgaWYgYW55dGhpbmcgaXMgd3JvbmcuXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZU9wdGlvbnMob3B0aW9ucykge1xuICBpZiAoIW9wdGlvbnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB1dGlscy5lYWNoKFsndmFyQ29udHJvbHMnLCAndGFnQ29udHJvbHMnLCAnY210Q29udHJvbHMnXSwgZnVuY3Rpb24gKGtleSkge1xuICAgIGlmICghb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghdXRpbHMuaXNBcnJheShvcHRpb25zW2tleV0pIHx8IG9wdGlvbnNba2V5XS5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT3B0aW9uIFwiJyArIGtleSArICdcIiBtdXN0IGJlIGFuIGFycmF5IGNvbnRhaW5pbmcgMiBkaWZmZXJlbnQgY29udHJvbCBzdHJpbmdzLicpO1xuICAgIH1cbiAgICBpZiAob3B0aW9uc1trZXldWzBdID09PSBvcHRpb25zW2tleV1bMV0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT3B0aW9uIFwiJyArIGtleSArICdcIiBvcGVuIGFuZCBjbG9zZSBjb250cm9scyBtdXN0IG5vdCBiZSB0aGUgc2FtZS4nKTtcbiAgICB9XG4gICAgdXRpbHMuZWFjaChvcHRpb25zW2tleV0sIGZ1bmN0aW9uIChhLCBpKSB7XG4gICAgICBpZiAoYS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignT3B0aW9uIFwiJyArIGtleSArICdcIiAnICsgKChpKSA/ICdvcGVuICcgOiAnY2xvc2UgJykgKyAnY29udHJvbCBtdXN0IGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVycy4gU2F3IFwiJyArIGEgKyAnXCIgaW5zdGVhZC4nKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ2NhY2hlJykpIHtcbiAgICBpZiAob3B0aW9ucy5jYWNoZSAmJiBvcHRpb25zLmNhY2hlICE9PSAnbWVtb3J5Jykge1xuICAgICAgaWYgKCFvcHRpb25zLmNhY2hlLmdldCB8fCAhb3B0aW9ucy5jYWNoZS5zZXQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNhY2hlIG9wdGlvbiAnICsgSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5jYWNoZSkgKyAnIGZvdW5kLiBFeHBlY3RlZCBcIm1lbW9yeVwiIG9yIHsgZ2V0OiBmdW5jdGlvbiAoa2V5KSB7IC4uLiB9LCBzZXQ6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7IC4uLiB9IH0uJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KCdsb2FkZXInKSkge1xuICAgIGlmIChvcHRpb25zLmxvYWRlcikge1xuICAgICAgaWYgKCFvcHRpb25zLmxvYWRlci5sb2FkIHx8ICFvcHRpb25zLmxvYWRlci5yZXNvbHZlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2FkZXIgb3B0aW9uICcgKyBKU09OLnN0cmluZ2lmeShvcHRpb25zLmxvYWRlcikgKyAnIGZvdW5kLiBFeHBlY3RlZCB7IGxvYWQ6IGZ1bmN0aW9uIChwYXRobmFtZSwgY2IpIHsgLi4uIH0sIHJlc29sdmU6IGZ1bmN0aW9uICh0bywgZnJvbSkgeyAuLi4gfSB9LicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG59XG5cbi8qKlxuICogU2V0IGRlZmF1bHRzIGZvciB0aGUgYmFzZSBhbmQgYWxsIG5ldyBTd2lnIGVudmlyb25tZW50cy5cbiAqXG4gKiBAZXhhbXBsZVxuICogc3dpZy5zZXREZWZhdWx0cyh7IGNhY2hlOiBmYWxzZSB9KTtcbiAqIC8vID0+IERpc2FibGVzIENhY2hlXG4gKlxuICogQGV4YW1wbGVcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2NhbHM6IHsgbm93OiBmdW5jdGlvbiAoKSB7IHJldHVybiBuZXcgRGF0ZSgpOyB9IH19KTtcbiAqIC8vID0+IHNldHMgYSBnbG9iYWxseSBhY2Nlc3NpYmxlIG1ldGhvZCBmb3IgYWxsIHRlbXBsYXRlXG4gKiAvLyAgICBjb250ZXh0cywgYWxsb3dpbmcgeW91IHRvIHByaW50IHRoZSBjdXJyZW50IGRhdGVcbiAqIC8vID0+IHt7IG5vdygpfGRhdGUoJ0YgalMsIFknKSB9fVxuICpcbiAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAqL1xuZXhwb3J0cy5zZXREZWZhdWx0cyA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuICB2YXIgbG9jYWxzID0gdXRpbHMuZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucy5sb2NhbHMsIG9wdGlvbnMubG9jYWxzIHx8IHt9KTtcblxuICB1dGlscy5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuICBkZWZhdWx0T3B0aW9ucy5sb2NhbHMgPSBsb2NhbHM7XG5cbiAgZGVmYXVsdEluc3RhbmNlLm9wdGlvbnMgPSB1dGlscy5leHRlbmQoZGVmYXVsdEluc3RhbmNlLm9wdGlvbnMsIG9wdGlvbnMpO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGRlZmF1bHQgVGltZVpvbmUgb2Zmc2V0IGZvciBkYXRlIGZvcm1hdHRpbmcgdmlhIHRoZSBkYXRlIGZpbHRlci4gVGhpcyBpcyBhIGdsb2JhbCBzZXR0aW5nIGFuZCB3aWxsIGFmZmVjdCBhbGwgU3dpZyBlbnZpcm9ubWVudHMsIG9sZCBvciBuZXcuXG4gKiBAcGFyYW0gIHtudW1iZXJ9IG9mZnNldCBPZmZzZXQgZnJvbSBHTVQsIGluIG1pbnV0ZXMuXG4gKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gKi9cbmV4cG9ydHMuc2V0RGVmYXVsdFRaT2Zmc2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBkYXRlZm9ybWF0dGVyLnR6T2Zmc2V0ID0gb2Zmc2V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcsIHNlcGFyYXRlIFN3aWcgY29tcGlsZS9yZW5kZXIgZW52aXJvbm1lbnQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHZhciBzd2lnID0gcmVxdWlyZSgnc3dpZycpO1xuICogdmFyIG15c3dpZyA9IG5ldyBzd2lnLlN3aWcoe3ZhckNvbnRyb2xzOiBbJzwlPScsICclPiddfSk7XG4gKiBteXN3aWcucmVuZGVyKCdUYWNvcyBhcmUgPCU9IHRhY29zID0+IScsIHsgbG9jYWxzOiB7IHRhY29zOiAnZGVsaWNpb3VzJyB9fSk7XG4gKiAvLyA9PiBUYWNvcyBhcmUgZGVsaWNpb3VzIVxuICogc3dpZy5yZW5kZXIoJ1RhY29zIGFyZSA8JT0gdGFjb3MgPT4hJywgeyBsb2NhbHM6IHsgdGFjb3M6ICdkZWxpY2lvdXMnIH19KTtcbiAqIC8vID0+ICdUYWNvcyBhcmUgPCU9IHRhY29zID0+ISdcbiAqXG4gKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdHM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgTmV3IFN3aWcgZW52aXJvbm1lbnQuXG4gKi9cbmV4cG9ydHMuU3dpZyA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIHZhbGlkYXRlT3B0aW9ucyhvcHRzKTtcbiAgdGhpcy5vcHRpb25zID0gdXRpbHMuZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cyB8fCB7fSk7XG4gIHRoaXMuY2FjaGUgPSB7fTtcbiAgdGhpcy5leHRlbnNpb25zID0ge307XG4gIHZhciBzZWxmID0gdGhpcyxcbiAgICB0YWdzID0gX3RhZ3MsXG4gICAgZmlsdGVycyA9IF9maWx0ZXJzO1xuXG4gIC8qKlxuICAgKiBHZXQgY29tYmluZWQgbG9jYWxzIGNvbnRleHQuXG4gICAqIEBwYXJhbSAgez9Td2lnT3B0c30gW29wdGlvbnNdIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge29iamVjdH0gICAgICAgICBMb2NhbHMgY29udGV4dC5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIGdldExvY2FscyhvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zIHx8ICFvcHRpb25zLmxvY2Fscykge1xuICAgICAgcmV0dXJuIHNlbGYub3B0aW9ucy5sb2NhbHM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHV0aWxzLmV4dGVuZCh7fSwgc2VsZi5vcHRpb25zLmxvY2Fscywgb3B0aW9ucy5sb2NhbHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjb21waWxlZCB0ZW1wbGF0ZSBmcm9tIHRoZSBjYWNoZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBrZXkgICAgICAgICAgIE5hbWUgb2YgdGVtcGxhdGUuXG4gICAqIEByZXR1cm4ge29iamVjdHx1bmRlZmluZWR9ICAgICBUZW1wbGF0ZSBmdW5jdGlvbiBhbmQgdG9rZW5zLlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gY2FjaGVHZXQoa2V5KSB7XG4gICAgaWYgKCFzZWxmLm9wdGlvbnMuY2FjaGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc2VsZi5vcHRpb25zLmNhY2hlID09PSAnbWVtb3J5Jykge1xuICAgICAgcmV0dXJuIHNlbGYuY2FjaGVba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZi5vcHRpb25zLmNhY2hlLmdldChrZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0b3JlIGEgdGVtcGxhdGUgaW4gdGhlIGNhY2hlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IGtleSBOYW1lIG9mIHRlbXBsYXRlLlxuICAgKiBAcGFyYW0gIHtvYmplY3R9IHZhbCBUZW1wbGF0ZSBmdW5jdGlvbiBhbmQgdG9rZW5zLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBjYWNoZVNldChrZXksIHZhbCkge1xuICAgIGlmICghc2VsZi5vcHRpb25zLmNhY2hlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNlbGYub3B0aW9ucy5jYWNoZSA9PT0gJ21lbW9yeScpIHtcbiAgICAgIHNlbGYuY2FjaGVba2V5XSA9IHZhbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzZWxmLm9wdGlvbnMuY2FjaGUuc2V0KGtleSwgdmFsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhcnMgdGhlIGluLW1lbW9yeSB0ZW1wbGF0ZSBjYWNoZS5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5pbnZhbGlkYXRlQ2FjaGUoKTtcbiAgICpcbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKi9cbiAgdGhpcy5pbnZhbGlkYXRlQ2FjaGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHNlbGYub3B0aW9ucy5jYWNoZSA9PT0gJ21lbW9yeScpIHtcbiAgICAgIHNlbGYuY2FjaGUgPSB7fTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIGN1c3RvbSBmaWx0ZXIgZm9yIHN3aWcgdmFyaWFibGVzLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBmdW5jdGlvbiByZXBsYWNlTXMoaW5wdXQpIHsgcmV0dXJuIGlucHV0LnJlcGxhY2UoL20vZywgJ2YnKTsgfVxuICAgKiBzd2lnLnNldEZpbHRlcigncmVwbGFjZU1zJywgcmVwbGFjZU1zKTtcbiAgICogLy8gPT4ge3sgXCJvbm9tYXRvcG9laWFcInxyZXBsYWNlTXMgfX1cbiAgICogLy8gPT4gb25vZmF0b3BlaWFcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9ICAgIG5hbWUgICAgTmFtZSBvZiBmaWx0ZXIsIHVzZWQgaW4gdGVtcGxhdGVzLiA8c3Ryb25nPldpbGw8L3N0cm9uZz4gb3ZlcndyaXRlIHByZXZpb3VzbHkgZGVmaW5lZCBmaWx0ZXJzLCBpZiB1c2luZyB0aGUgc2FtZSBuYW1lLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSAgbWV0aG9kICBGdW5jdGlvbiB0aGF0IGFjdHMgYWdhaW5zdCB0aGUgaW5wdXQuIFNlZSA8YSBocmVmPVwiL2RvY3MvZmlsdGVycy8jY3VzdG9tXCI+Q3VzdG9tIEZpbHRlcnM8L2E+IGZvciBtb3JlIGluZm9ybWF0aW9uLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqL1xuICB0aGlzLnNldEZpbHRlciA9IGZ1bmN0aW9uIChuYW1lLCBtZXRob2QpIHtcbiAgICBpZiAodHlwZW9mIG1ldGhvZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbHRlciBcIicgKyBuYW1lICsgJ1wiIGlzIG5vdCBhIHZhbGlkIGZ1bmN0aW9uLicpO1xuICAgIH1cbiAgICBmaWx0ZXJzW25hbWVdID0gbWV0aG9kO1xuICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBjdXN0b20gdGFnLiBUbyBleHBvc2UgeW91ciBvd24gZXh0ZW5zaW9ucyB0byBjb21waWxlZCB0ZW1wbGF0ZSBjb2RlLCBzZWUgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+c3dpZy5zZXRFeHRlbnNpb248L2NvZGU+LlxuICAgKlxuICAgKiBGb3IgYSBtb3JlIGluLWRlcHRoIGV4cGxhbmF0aW9uIG9mIHdyaXRpbmcgY3VzdG9tIHRhZ3MsIHNlZSA8YSBocmVmPVwiLi4vZXh0ZW5kaW5nLyN0YWdzXCI+Q3VzdG9tIFRhZ3M8L2E+LlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiB2YXIgdGFjb3RhZyA9IHJlcXVpcmUoJy4vdGFjb3RhZycpO1xuICAgKiBzd2lnLnNldFRhZygndGFjb3MnLCB0YWNvdGFnLnBhcnNlLCB0YWNvdGFnLmNvbXBpbGUsIHRhY290YWcuZW5kcywgdGFjb3RhZy5ibG9ja0xldmVsKTtcbiAgICogLy8gPT4geyUgdGFjb3MgJX1NYWtlIHRoaXMgYmUgdGFjb3MueyUgZW5kdGFjb3MgJX1cbiAgICogLy8gPT4gVGFjb3MgdGFjb3MgdGFjb3MgdGFjb3MuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gbmFtZSAgICAgIFRhZyBuYW1lLlxuICAgKiBAcGFyYW0gIHtmdW5jdGlvbn0gcGFyc2UgICBNZXRob2QgZm9yIHBhcnNpbmcgdG9rZW5zLlxuICAgKiBAcGFyYW0gIHtmdW5jdGlvbn0gY29tcGlsZSBNZXRob2QgZm9yIGNvbXBpbGluZyByZW5kZXJhYmxlIG91dHB1dC5cbiAgICogQHBhcmFtICB7Ym9vbGVhbn0gW2VuZHM9ZmFsc2VdICAgICBXaGV0aGVyIG9yIG5vdCB0aGlzIHRhZyByZXF1aXJlcyBhbiA8aT5lbmQ8L2k+IHRhZy5cbiAgICogQHBhcmFtICB7Ym9vbGVhbn0gW2Jsb2NrTGV2ZWw9ZmFsc2VdIElmIGZhbHNlLCB0aGlzIHRhZyB3aWxsIG5vdCBiZSBjb21waWxlZCBvdXRzaWRlIG9mIDxjb2RlPmJsb2NrPC9jb2RlPiB0YWdzIHdoZW4gZXh0ZW5kaW5nIGEgcGFyZW50IHRlbXBsYXRlLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqL1xuICB0aGlzLnNldFRhZyA9IGZ1bmN0aW9uIChuYW1lLCBwYXJzZSwgY29tcGlsZSwgZW5kcywgYmxvY2tMZXZlbCkge1xuICAgIGlmICh0eXBlb2YgcGFyc2UgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGFnIFwiJyArIG5hbWUgKyAnXCIgcGFyc2UgbWV0aG9kIGlzIG5vdCBhIHZhbGlkIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY29tcGlsZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYWcgXCInICsgbmFtZSArICdcIiBjb21waWxlIG1ldGhvZCBpcyBub3QgYSB2YWxpZCBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICB0YWdzW25hbWVdID0ge1xuICAgICAgcGFyc2U6IHBhcnNlLFxuICAgICAgY29tcGlsZTogY29tcGlsZSxcbiAgICAgIGVuZHM6IGVuZHMgfHwgZmFsc2UsXG4gICAgICBibG9jazogISFibG9ja0xldmVsXG4gICAgfTtcbiAgfTtcblxuICAvKipcbiAgICogQWRkIGV4dGVuc2lvbnMgZm9yIGN1c3RvbSB0YWdzLiBUaGlzIGFsbG93cyBhbnkgY3VzdG9tIHRhZyB0byBhY2Nlc3MgYSBnbG9iYWxseSBhdmFpbGFibGUgbWV0aG9kcyB2aWEgYSBzcGVjaWFsIGdsb2JhbGx5IGF2YWlsYWJsZSBvYmplY3QsIDx2YXI+X2V4dDwvdmFyPiwgaW4gdGVtcGxhdGVzLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLnNldEV4dGVuc2lvbigndHJhbnMnLCBmdW5jdGlvbiAodikgeyByZXR1cm4gdHJhbnNsYXRlKHYpOyB9KTtcbiAgICogZnVuY3Rpb24gY29tcGlsZVRyYW5zKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnQsIG9wdGlvbnMpIHtcbiAgICogICByZXR1cm4gJ19vdXRwdXQgKz0gX2V4dC50cmFucygnICsgYXJnc1swXSArICcpOydcbiAgICogfTtcbiAgICogc3dpZy5zZXRUYWcoJ3RyYW5zJywgcGFyc2VUcmFucywgY29tcGlsZVRyYW5zLCB0cnVlKTtcbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBuYW1lICAgS2V5IG5hbWUgb2YgdGhlIGV4dGVuc2lvbi4gQWNjZXNzZWQgdmlhIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPl9leHRbbmFtZV08L2NvZGU+LlxuICAgKiBAcGFyYW0gIHsqfSAgICAgIG9iamVjdCBUaGUgbWV0aG9kLCB2YWx1ZSwgb3Igb2JqZWN0IHRoYXQgc2hvdWxkIGJlIGF2YWlsYWJsZSB2aWEgdGhlIGdpdmVuIG5hbWUuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICovXG4gIHRoaXMuc2V0RXh0ZW5zaW9uID0gZnVuY3Rpb24gKG5hbWUsIG9iamVjdCkge1xuICAgIHNlbGYuZXh0ZW5zaW9uc1tuYW1lXSA9IG9iamVjdDtcbiAgfTtcblxuICAvKipcbiAgICogUGFyc2UgYSBnaXZlbiBzb3VyY2Ugc3RyaW5nIGludG8gdG9rZW5zLlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHNvdXJjZSAgU3dpZyB0ZW1wbGF0ZSBzb3VyY2UuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7b2JqZWN0fSBwYXJzZWQgIFRlbXBsYXRlIHRva2VucyBvYmplY3QuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICB0aGlzLnBhcnNlID0gZnVuY3Rpb24gKHNvdXJjZSwgb3B0aW9ucykge1xuICAgIHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuICAgIHZhciBsb2NhbHMgPSBnZXRMb2NhbHMob3B0aW9ucyksXG4gICAgICBvcHRzID0ge30sXG4gICAgICBrO1xuXG4gICAgZm9yIChrIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KGspICYmIGsgIT09ICdsb2NhbHMnKSB7XG4gICAgICAgIG9wdHNba10gPSBvcHRpb25zW2tdO1xuICAgICAgfVxuICAgIH1cblxuICAgIG9wdGlvbnMgPSB1dGlscy5leHRlbmQoe30sIHNlbGYub3B0aW9ucywgb3B0cyk7XG4gICAgb3B0aW9ucy5sb2NhbHMgPSBsb2NhbHM7XG5cbiAgICByZXR1cm4gcGFyc2VyLnBhcnNlKHNvdXJjZSwgb3B0aW9ucywgdGFncywgZmlsdGVycyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgZ2l2ZW4gZmlsZSBpbnRvIHRva2Vucy5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBwYXRobmFtZSAgRnVsbCBwYXRoIHRvIGZpbGUgdG8gcGFyc2UuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gICBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtvYmplY3R9IHBhcnNlZCAgICBUZW1wbGF0ZSB0b2tlbnMgb2JqZWN0LlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgdGhpcy5wYXJzZUZpbGUgPSBmdW5jdGlvbiAocGF0aG5hbWUsIG9wdGlvbnMpIHtcbiAgICB2YXIgc3JjO1xuXG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuXG4gICAgcGF0aG5hbWUgPSBzZWxmLm9wdGlvbnMubG9hZGVyLnJlc29sdmUocGF0aG5hbWUsIG9wdGlvbnMucmVzb2x2ZUZyb20pO1xuXG4gICAgc3JjID0gc2VsZi5vcHRpb25zLmxvYWRlci5sb2FkKHBhdGhuYW1lKTtcblxuICAgIGlmICghb3B0aW9ucy5maWxlbmFtZSkge1xuICAgICAgb3B0aW9ucyA9IHV0aWxzLmV4dGVuZCh7IGZpbGVuYW1lOiBwYXRobmFtZSB9LCBvcHRpb25zKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZi5wYXJzZShzcmMsIG9wdGlvbnMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSZS1NYXAgYmxvY2tzIHdpdGhpbiBhIGxpc3Qgb2YgdG9rZW5zIHRvIHRoZSB0ZW1wbGF0ZSdzIGJsb2NrIG9iamVjdHMuXG4gICAqIEBwYXJhbSAge2FycmF5fSAgdG9rZW5zICAgTGlzdCBvZiB0b2tlbnMgZm9yIHRoZSBwYXJlbnQgb2JqZWN0LlxuICAgKiBAcGFyYW0gIHtvYmplY3R9IHRlbXBsYXRlIEN1cnJlbnQgdGVtcGxhdGUgdGhhdCBuZWVkcyB0byBiZSBtYXBwZWQgdG8gdGhlICBwYXJlbnQncyBibG9jayBhbmQgdG9rZW4gbGlzdC5cbiAgICogQHJldHVybiB7YXJyYXl9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiByZW1hcEJsb2NrcyhibG9ja3MsIHRva2Vucykge1xuICAgIHJldHVybiB1dGlscy5tYXAodG9rZW5zLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgIHZhciBhcmdzID0gdG9rZW4uYXJncyA/IHRva2VuLmFyZ3Muam9pbignJykgOiAnJztcbiAgICAgIGlmICh0b2tlbi5uYW1lID09PSAnYmxvY2snICYmIGJsb2Nrc1thcmdzXSkge1xuICAgICAgICB0b2tlbiA9IGJsb2Nrc1thcmdzXTtcbiAgICAgIH1cbiAgICAgIGlmICh0b2tlbi5jb250ZW50ICYmIHRva2VuLmNvbnRlbnQubGVuZ3RoKSB7XG4gICAgICAgIHRva2VuLmNvbnRlbnQgPSByZW1hcEJsb2NrcyhibG9ja3MsIHRva2VuLmNvbnRlbnQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRva2VuO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEltcG9ydCBibG9jay1sZXZlbCB0YWdzIHRvIHRoZSB0b2tlbiBsaXN0IHRoYXQgYXJlIG5vdCBhY3R1YWwgYmxvY2sgdGFncy5cbiAgICogQHBhcmFtICB7YXJyYXl9IGJsb2NrcyBMaXN0IG9mIGJsb2NrLWxldmVsIHRhZ3MuXG4gICAqIEBwYXJhbSAge2FycmF5fSB0b2tlbnMgTGlzdCBvZiB0b2tlbnMgdG8gcmVuZGVyLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBpbXBvcnROb25CbG9ja3MoYmxvY2tzLCB0b2tlbnMpIHtcbiAgICB1dGlscy5lYWNoKGJsb2NrcywgZnVuY3Rpb24gKGJsb2NrKSB7XG4gICAgICBpZiAoYmxvY2submFtZSAhPT0gJ2Jsb2NrJykge1xuICAgICAgICB0b2tlbnMudW5zaGlmdChibG9jayk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVjdXJzaXZlbHkgY29tcGlsZSBhbmQgZ2V0IHBhcmVudHMgb2YgZ2l2ZW4gcGFyc2VkIHRva2VuIG9iamVjdC5cbiAgICpcbiAgICogQHBhcmFtICB7b2JqZWN0fSB0b2tlbnMgICAgUGFyc2VkIHRva2VucyBmcm9tIHRlbXBsYXRlLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dICAgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7b2JqZWN0fSAgICAgICAgICAgUGFyc2VkIHRva2VucyBmcm9tIHBhcmVudCB0ZW1wbGF0ZXMuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBnZXRQYXJlbnRzKHRva2Vucywgb3B0aW9ucykge1xuICAgIHZhciBwYXJlbnROYW1lID0gdG9rZW5zLnBhcmVudCxcbiAgICAgIHBhcmVudEZpbGVzID0gW10sXG4gICAgICBwYXJlbnRzID0gW10sXG4gICAgICBwYXJlbnRGaWxlLFxuICAgICAgcGFyZW50LFxuICAgICAgbDtcblxuICAgIHdoaWxlIChwYXJlbnROYW1lKSB7XG4gICAgICBpZiAoIW9wdGlvbnMgfHwgIW9wdGlvbnMuZmlsZW5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZXh0ZW5kIFwiJyArIHBhcmVudE5hbWUgKyAnXCIgYmVjYXVzZSBjdXJyZW50IHRlbXBsYXRlIGhhcyBubyBmaWxlbmFtZS4nKTtcbiAgICAgIH1cblxuICAgICAgcGFyZW50RmlsZSA9IHBhcmVudEZpbGUgfHwgb3B0aW9ucy5maWxlbmFtZTtcbiAgICAgIHBhcmVudEZpbGUgPSBzZWxmLm9wdGlvbnMubG9hZGVyLnJlc29sdmUocGFyZW50TmFtZSwgcGFyZW50RmlsZSk7XG4gICAgICBwYXJlbnQgPSBjYWNoZUdldChwYXJlbnRGaWxlKSB8fCBzZWxmLnBhcnNlRmlsZShwYXJlbnRGaWxlLCB1dGlscy5leHRlbmQoe30sIG9wdGlvbnMsIHsgZmlsZW5hbWU6IHBhcmVudEZpbGUgfSkpO1xuICAgICAgcGFyZW50TmFtZSA9IHBhcmVudC5wYXJlbnQ7XG5cbiAgICAgIGlmIChwYXJlbnRGaWxlcy5pbmRleE9mKHBhcmVudEZpbGUpICE9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgY2lyY3VsYXIgZXh0ZW5kcyBvZiBcIicgKyBwYXJlbnRGaWxlICsgJ1wiLicpO1xuICAgICAgfVxuICAgICAgcGFyZW50RmlsZXMucHVzaChwYXJlbnRGaWxlKTtcblxuICAgICAgcGFyZW50cy5wdXNoKHBhcmVudCk7XG4gICAgfVxuXG4gICAgLy8gUmVtYXAgZWFjaCBwYXJlbnRzJygxKSBibG9ja3Mgb250byBpdHMgb3duIHBhcmVudCgyKSwgcmVjZWl2aW5nIHRoZSBmdWxsIHRva2VuIGxpc3QgZm9yIHJlbmRlcmluZyB0aGUgb3JpZ2luYWwgcGFyZW50KDEpIG9uIGl0cyBvd24uXG4gICAgbCA9IHBhcmVudHMubGVuZ3RoO1xuICAgIGZvciAobCA9IHBhcmVudHMubGVuZ3RoIC0gMjsgbCA+PSAwOyBsIC09IDEpIHtcbiAgICAgIHBhcmVudHNbbF0udG9rZW5zID0gcmVtYXBCbG9ja3MocGFyZW50c1tsXS5ibG9ja3MsIHBhcmVudHNbbCArIDFdLnRva2Vucyk7XG4gICAgICBpbXBvcnROb25CbG9ja3MocGFyZW50c1tsXS5ibG9ja3MsIHBhcmVudHNbbF0udG9rZW5zKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFyZW50cztcbiAgfVxuXG4gIC8qKlxuICAgKiBQcmUtY29tcGlsZSBhIHNvdXJjZSBzdHJpbmcgaW50byBhIGNhY2hlLWFibGUgdGVtcGxhdGUgZnVuY3Rpb24uXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcucHJlY29tcGlsZSgne3sgdGFjb3MgfX0nKTtcbiAgICogLy8gPT4ge1xuICAgKiAvLyAgICAgIHRwbDogZnVuY3Rpb24gKF9zd2lnLCBfbG9jYWxzLCBfZmlsdGVycywgX3V0aWxzLCBfZm4pIHsgLi4uIH0sXG4gICAqIC8vICAgICAgdG9rZW5zOiB7XG4gICAqIC8vICAgICAgICBuYW1lOiB1bmRlZmluZWQsXG4gICAqIC8vICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAqIC8vICAgICAgICB0b2tlbnM6IFsuLi5dLFxuICAgKiAvLyAgICAgICAgYmxvY2tzOiB7fVxuICAgKiAvLyAgICAgIH1cbiAgICogLy8gICAgfVxuICAgKlxuICAgKiBJbiBvcmRlciB0byByZW5kZXIgYSBwcmUtY29tcGlsZWQgdGVtcGxhdGUsIHlvdSBtdXN0IGhhdmUgYWNjZXNzIHRvIGZpbHRlcnMgYW5kIHV0aWxzIGZyb20gU3dpZy4gPHZhcj5lZm48L3Zhcj4gaXMgc2ltcGx5IGFuIGVtcHR5IGZ1bmN0aW9uIHRoYXQgZG9lcyBub3RoaW5nLlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHNvdXJjZSAgU3dpZyB0ZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge29iamVjdH0gICAgICAgICBSZW5kZXJhYmxlIGZ1bmN0aW9uIGFuZCB0b2tlbnMgb2JqZWN0LlxuICAgKi9cbiAgdGhpcy5wcmVjb21waWxlID0gZnVuY3Rpb24gKHNvdXJjZSwgb3B0aW9ucykge1xuICAgIHZhciB0b2tlbnMgPSBzZWxmLnBhcnNlKHNvdXJjZSwgb3B0aW9ucyksXG4gICAgICBwYXJlbnRzID0gZ2V0UGFyZW50cyh0b2tlbnMsIG9wdGlvbnMpLFxuICAgICAgdHBsO1xuXG4gICAgaWYgKHBhcmVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBSZW1hcCB0aGUgdGVtcGxhdGVzIGZpcnN0LXBhcmVudCdzIHRva2VucyB1c2luZyB0aGlzIHRlbXBsYXRlJ3MgYmxvY2tzLlxuICAgICAgdG9rZW5zLnRva2VucyA9IHJlbWFwQmxvY2tzKHRva2Vucy5ibG9ja3MsIHBhcmVudHNbMF0udG9rZW5zKTtcbiAgICAgIGltcG9ydE5vbkJsb2Nrcyh0b2tlbnMuYmxvY2tzLCB0b2tlbnMudG9rZW5zKTtcbiAgICB9XG5cbiAgICB0cGwgPSBuZXcgRnVuY3Rpb24oJ19zd2lnJywgJ19jdHgnLCAnX2ZpbHRlcnMnLCAnX3V0aWxzJywgJ19mbicsXG4gICAgICAnICB2YXIgX2V4dCA9IF9zd2lnLmV4dGVuc2lvbnMsXFxuJyArXG4gICAgICAnICAgIF9vdXRwdXQgPSBcIlwiO1xcbicgK1xuICAgICAgcGFyc2VyLmNvbXBpbGUodG9rZW5zLCBwYXJlbnRzLCBvcHRpb25zKSArICdcXG4nICtcbiAgICAgICcgIHJldHVybiBfb3V0cHV0O1xcbidcbiAgICAgICk7XG5cbiAgICByZXR1cm4geyB0cGw6IHRwbCwgdG9rZW5zOiB0b2tlbnMgfTtcbiAgfTtcblxuICAvKipcbiAgICogQ29tcGlsZSBhbmQgcmVuZGVyIGEgdGVtcGxhdGUgc3RyaW5nIGZvciBmaW5hbCBvdXRwdXQuXG4gICAqXG4gICAqIFdoZW4gcmVuZGVyaW5nIGEgc291cmNlIHN0cmluZywgYSBmaWxlIHBhdGggc2hvdWxkIGJlIHNwZWNpZmllZCBpbiB0aGUgb3B0aW9ucyBvYmplY3QgaW4gb3JkZXIgZm9yIDx2YXI+ZXh0ZW5kczwvdmFyPiwgPHZhcj5pbmNsdWRlPC92YXI+LCBhbmQgPHZhcj5pbXBvcnQ8L3Zhcj4gdG8gd29yayBwcm9wZXJseS4gRG8gdGhpcyBieSBhZGRpbmcgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+eyBmaWxlbmFtZTogJy9hYnNvbHV0ZS9wYXRoL3RvL215dHBsLmh0bWwnIH08L2NvZGU+IHRvIHRoZSBvcHRpb25zIGFyZ3VtZW50LlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLnJlbmRlcigne3sgdGFjb3MgfX0nLCB7IGxvY2FsczogeyB0YWNvczogJ1RhY29zISEhIScgfX0pO1xuICAgKiAvLyA9PiBUYWNvcyEhISFcbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBzb3VyY2UgICAgU3dpZyB0ZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgIFJlbmRlcmVkIG91dHB1dC5cbiAgICovXG4gIHRoaXMucmVuZGVyID0gZnVuY3Rpb24gKHNvdXJjZSwgb3B0aW9ucykge1xuICAgIHJldHVybiBzZWxmLmNvbXBpbGUoc291cmNlLCBvcHRpb25zKSgpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDb21waWxlIGFuZCByZW5kZXIgYSB0ZW1wbGF0ZSBmaWxlIGZvciBmaW5hbCBvdXRwdXQuIFRoaXMgaXMgbW9zdCB1c2VmdWwgZm9yIGxpYnJhcmllcyBsaWtlIEV4cHJlc3MuanMuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcucmVuZGVyRmlsZSgnLi90ZW1wbGF0ZS5odG1sJywge30sIGZ1bmN0aW9uIChlcnIsIG91dHB1dCkge1xuICAgKiAgIGlmIChlcnIpIHtcbiAgICogICAgIHRocm93IGVycjtcbiAgICogICB9XG4gICAqICAgY29uc29sZS5sb2cob3V0cHV0KTtcbiAgICogfSk7XG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcucmVuZGVyRmlsZSgnLi90ZW1wbGF0ZS5odG1sJywge30pO1xuICAgKiAvLyA9PiBvdXRwdXRcbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSAgIHBhdGhOYW1lICAgIEZpbGUgbG9jYXRpb24uXG4gICAqIEBwYXJhbSAge29iamVjdH0gICBbbG9jYWxzPXt9XSBUZW1wbGF0ZSB2YXJpYWJsZSBjb250ZXh0LlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiXSBBc3luY3Jvbm91cyBjYWxsYmFjayBmdW5jdGlvbi4gSWYgbm90IHByb3ZpZGVkLCA8dmFyPmNvbXBpbGVGaWxlPC92YXI+IHdpbGwgcnVuIHN5bmNyb25vdXNseS5cbiAgICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICBSZW5kZXJlZCBvdXRwdXQuXG4gICAqL1xuICB0aGlzLnJlbmRlckZpbGUgPSBmdW5jdGlvbiAocGF0aE5hbWUsIGxvY2FscywgY2IpIHtcbiAgICBpZiAoY2IpIHtcbiAgICAgIHNlbGYuY29tcGlsZUZpbGUocGF0aE5hbWUsIHt9LCBmdW5jdGlvbiAoZXJyLCBmbikge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2IobnVsbCwgZm4obG9jYWxzKSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZi5jb21waWxlRmlsZShwYXRoTmFtZSkobG9jYWxzKTtcbiAgfTtcblxuICAvKipcbiAgICogQ29tcGlsZSBzdHJpbmcgc291cmNlIGludG8gYSByZW5kZXJhYmxlIHRlbXBsYXRlIGZ1bmN0aW9uLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiB2YXIgdHBsID0gc3dpZy5jb21waWxlKCd7eyB0YWNvcyB9fScpO1xuICAgKiAvLyA9PiB7XG4gICAqIC8vICAgICAgW0Z1bmN0aW9uOiBjb21waWxlZF1cbiAgICogLy8gICAgICBwYXJlbnQ6IG51bGwsXG4gICAqIC8vICAgICAgdG9rZW5zOiBbeyBjb21waWxlOiBbRnVuY3Rpb25dIH1dLFxuICAgKiAvLyAgICAgIGJsb2Nrczoge31cbiAgICogLy8gICAgfVxuICAgKiB0cGwoeyB0YWNvczogJ1RhY29zISEhIScgfSk7XG4gICAqIC8vID0+IFRhY29zISEhIVxuICAgKlxuICAgKiBXaGVuIGNvbXBpbGluZyBhIHNvdXJjZSBzdHJpbmcsIGEgZmlsZSBwYXRoIHNob3VsZCBiZSBzcGVjaWZpZWQgaW4gdGhlIG9wdGlvbnMgb2JqZWN0IGluIG9yZGVyIGZvciA8dmFyPmV4dGVuZHM8L3Zhcj4sIDx2YXI+aW5jbHVkZTwvdmFyPiwgYW5kIDx2YXI+aW1wb3J0PC92YXI+IHRvIHdvcmsgcHJvcGVybHkuIERvIHRoaXMgYnkgYWRkaW5nIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPnsgZmlsZW5hbWU6ICcvYWJzb2x1dGUvcGF0aC90by9teXRwbC5odG1sJyB9PC9jb2RlPiB0byB0aGUgb3B0aW9ucyBhcmd1bWVudC5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBzb3VyY2UgICAgU3dpZyB0ZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge2Z1bmN0aW9ufSAgICAgICAgIFJlbmRlcmFibGUgZnVuY3Rpb24gd2l0aCBrZXlzIGZvciBwYXJlbnQsIGJsb2NrcywgYW5kIHRva2Vucy5cbiAgICovXG4gIHRoaXMuY29tcGlsZSA9IGZ1bmN0aW9uIChzb3VyY2UsIG9wdGlvbnMpIHtcbiAgICB2YXIga2V5ID0gb3B0aW9ucyA/IG9wdGlvbnMuZmlsZW5hbWUgOiBudWxsLFxuICAgICAgY2FjaGVkID0ga2V5ID8gY2FjaGVHZXQoa2V5KSA6IG51bGwsXG4gICAgICBjb250ZXh0LFxuICAgICAgY29udGV4dExlbmd0aCxcbiAgICAgIHByZTtcblxuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgfVxuXG4gICAgY29udGV4dCA9IGdldExvY2FscyhvcHRpb25zKTtcbiAgICBjb250ZXh0TGVuZ3RoID0gdXRpbHMua2V5cyhjb250ZXh0KS5sZW5ndGg7XG4gICAgcHJlID0gdGhpcy5wcmVjb21waWxlKHNvdXJjZSwgb3B0aW9ucyk7XG5cbiAgICBmdW5jdGlvbiBjb21waWxlZChsb2NhbHMpIHtcbiAgICAgIHZhciBsY2xzO1xuICAgICAgaWYgKGxvY2FscyAmJiBjb250ZXh0TGVuZ3RoKSB7XG4gICAgICAgIGxjbHMgPSB1dGlscy5leHRlbmQoe30sIGNvbnRleHQsIGxvY2Fscyk7XG4gICAgICB9IGVsc2UgaWYgKGxvY2FscyAmJiAhY29udGV4dExlbmd0aCkge1xuICAgICAgICBsY2xzID0gbG9jYWxzO1xuICAgICAgfSBlbHNlIGlmICghbG9jYWxzICYmIGNvbnRleHRMZW5ndGgpIHtcbiAgICAgICAgbGNscyA9IGNvbnRleHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsY2xzID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gcHJlLnRwbChzZWxmLCBsY2xzLCBmaWx0ZXJzLCB1dGlscywgZWZuKTtcbiAgICB9XG5cbiAgICB1dGlscy5leHRlbmQoY29tcGlsZWQsIHByZS50b2tlbnMpO1xuXG4gICAgaWYgKGtleSkge1xuICAgICAgY2FjaGVTZXQoa2V5LCBjb21waWxlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbXBpbGVkO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDb21waWxlIGEgc291cmNlIGZpbGUgaW50byBhIHJlbmRlcmFibGUgdGVtcGxhdGUgZnVuY3Rpb24uXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHZhciB0cGwgPSBzd2lnLmNvbXBpbGVGaWxlKCcuL215dHBsLmh0bWwnKTtcbiAgICogLy8gPT4ge1xuICAgKiAvLyAgICAgIFtGdW5jdGlvbjogY29tcGlsZWRdXG4gICAqIC8vICAgICAgcGFyZW50OiBudWxsLFxuICAgKiAvLyAgICAgIHRva2VuczogW3sgY29tcGlsZTogW0Z1bmN0aW9uXSB9XSxcbiAgICogLy8gICAgICBibG9ja3M6IHt9XG4gICAqIC8vICAgIH1cbiAgICogdHBsKHsgdGFjb3M6ICdUYWNvcyEhISEnIH0pO1xuICAgKiAvLyA9PiBUYWNvcyEhISFcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5jb21waWxlRmlsZSgnL215ZmlsZS50eHQnLCB7IHZhckNvbnRyb2xzOiBbJzwlPScsICc9JT4nXSwgdGFnQ29udHJvbHM6IFsnPCUnLCAnJT4nXX0pO1xuICAgKiAvLyA9PiB3aWxsIGNvbXBpbGUgJ215ZmlsZS50eHQnIHVzaW5nIHRoZSB2YXIgYW5kIHRhZyBjb250cm9scyBhcyBzcGVjaWZpZWQuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gcGF0aG5hbWUgIEZpbGUgbG9jYXRpb24uXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHBhcmFtICB7RnVuY3Rpb259IFtjYl0gQXN5bmNyb25vdXMgY2FsbGJhY2sgZnVuY3Rpb24uIElmIG5vdCBwcm92aWRlZCwgPHZhcj5jb21waWxlRmlsZTwvdmFyPiB3aWxsIHJ1biBzeW5jcm9ub3VzbHkuXG4gICAqIEByZXR1cm4ge2Z1bmN0aW9ufSAgICAgICAgIFJlbmRlcmFibGUgZnVuY3Rpb24gd2l0aCBrZXlzIGZvciBwYXJlbnQsIGJsb2NrcywgYW5kIHRva2Vucy5cbiAgICovXG4gIHRoaXMuY29tcGlsZUZpbGUgPSBmdW5jdGlvbiAocGF0aG5hbWUsIG9wdGlvbnMsIGNiKSB7XG4gICAgdmFyIHNyYywgY2FjaGVkO1xuXG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuXG4gICAgcGF0aG5hbWUgPSBzZWxmLm9wdGlvbnMubG9hZGVyLnJlc29sdmUocGF0aG5hbWUsIG9wdGlvbnMucmVzb2x2ZUZyb20pO1xuICAgIGlmICghb3B0aW9ucy5maWxlbmFtZSkge1xuICAgICAgb3B0aW9ucyA9IHV0aWxzLmV4dGVuZCh7IGZpbGVuYW1lOiBwYXRobmFtZSB9LCBvcHRpb25zKTtcbiAgICB9XG4gICAgY2FjaGVkID0gY2FjaGVHZXQocGF0aG5hbWUpO1xuXG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGNiKG51bGwsIGNhY2hlZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgfVxuXG4gICAgaWYgKGNiKSB7XG4gICAgICBzZWxmLm9wdGlvbnMubG9hZGVyLmxvYWQocGF0aG5hbWUsIGZ1bmN0aW9uIChlcnIsIHNyYykge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBpbGVkO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29tcGlsZWQgPSBzZWxmLmNvbXBpbGUoc3JjLCBvcHRpb25zKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyMikge1xuICAgICAgICAgIGNiKGVycjIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNiKGVyciwgY29tcGlsZWQpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc3JjID0gc2VsZi5vcHRpb25zLmxvYWRlci5sb2FkKHBhdGhuYW1lKTtcbiAgICByZXR1cm4gc2VsZi5jb21waWxlKHNyYywgb3B0aW9ucyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFJ1biBhIHByZS1jb21waWxlZCB0ZW1wbGF0ZSBmdW5jdGlvbi4gVGhpcyBpcyBtb3N0IHVzZWZ1bCBpbiB0aGUgYnJvd3NlciB3aGVuIHlvdSd2ZSBwcmUtY29tcGlsZWQgeW91ciB0ZW1wbGF0ZXMgd2l0aCB0aGUgU3dpZyBjb21tYW5kLWxpbmUgdG9vbC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogJCBzd2lnIGNvbXBpbGUgLi9teXRwbC5odG1sIC0td3JhcC1zdGFydD1cInZhciBteXRwbCA9IFwiID4gbXl0cGwuanNcbiAgICogQGV4YW1wbGVcbiAgICogPHNjcmlwdCBzcmM9XCJteXRwbC5qc1wiPjwvc2NyaXB0PlxuICAgKiA8c2NyaXB0PlxuICAgKiAgIHN3aWcucnVuKG15dHBsLCB7fSk7XG4gICAqICAgLy8gPT4gXCJyZW5kZXJlZCB0ZW1wbGF0ZS4uLlwiXG4gICAqIDwvc2NyaXB0PlxuICAgKlxuICAgKiBAcGFyYW0gIHtmdW5jdGlvbn0gdHBsICAgICAgIFByZS1jb21waWxlZCBTd2lnIHRlbXBsYXRlIGZ1bmN0aW9uLiBVc2UgdGhlIFN3aWcgQ0xJIHRvIGNvbXBpbGUgeW91ciB0ZW1wbGF0ZXMuXG4gICAqIEBwYXJhbSAge29iamVjdH0gW2xvY2Fscz17fV0gVGVtcGxhdGUgdmFyaWFibGUgY29udGV4dC5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBbZmlsZXBhdGhdICBGaWxlbmFtZSB1c2VkIGZvciBjYWNoaW5nIHRoZSB0ZW1wbGF0ZS5cbiAgICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICBSZW5kZXJlZCBvdXRwdXQuXG4gICAqL1xuICB0aGlzLnJ1biA9IGZ1bmN0aW9uICh0cGwsIGxvY2FscywgZmlsZXBhdGgpIHtcbiAgICB2YXIgY29udGV4dCA9IGdldExvY2Fscyh7IGxvY2FsczogbG9jYWxzIH0pO1xuICAgIGlmIChmaWxlcGF0aCkge1xuICAgICAgY2FjaGVTZXQoZmlsZXBhdGgsIHRwbCk7XG4gICAgfVxuICAgIHJldHVybiB0cGwoc2VsZiwgY29udGV4dCwgZmlsdGVycywgdXRpbHMsIGVmbik7XG4gIH07XG59O1xuXG4vKiFcbiAqIEV4cG9ydCBtZXRob2RzIHB1YmxpY2x5XG4gKi9cbmRlZmF1bHRJbnN0YW5jZSA9IG5ldyBleHBvcnRzLlN3aWcoKTtcbmV4cG9ydHMuc2V0RmlsdGVyID0gZGVmYXVsdEluc3RhbmNlLnNldEZpbHRlcjtcbmV4cG9ydHMuc2V0VGFnID0gZGVmYXVsdEluc3RhbmNlLnNldFRhZztcbmV4cG9ydHMuc2V0RXh0ZW5zaW9uID0gZGVmYXVsdEluc3RhbmNlLnNldEV4dGVuc2lvbjtcbmV4cG9ydHMucGFyc2VGaWxlID0gZGVmYXVsdEluc3RhbmNlLnBhcnNlRmlsZTtcbmV4cG9ydHMucHJlY29tcGlsZSA9IGRlZmF1bHRJbnN0YW5jZS5wcmVjb21waWxlO1xuZXhwb3J0cy5jb21waWxlID0gZGVmYXVsdEluc3RhbmNlLmNvbXBpbGU7XG5leHBvcnRzLmNvbXBpbGVGaWxlID0gZGVmYXVsdEluc3RhbmNlLmNvbXBpbGVGaWxlO1xuZXhwb3J0cy5yZW5kZXIgPSBkZWZhdWx0SW5zdGFuY2UucmVuZGVyO1xuZXhwb3J0cy5yZW5kZXJGaWxlID0gZGVmYXVsdEluc3RhbmNlLnJlbmRlckZpbGU7XG5leHBvcnRzLnJ1biA9IGRlZmF1bHRJbnN0YW5jZS5ydW47XG5leHBvcnRzLmludmFsaWRhdGVDYWNoZSA9IGRlZmF1bHRJbnN0YW5jZS5pbnZhbGlkYXRlQ2FjaGU7XG5leHBvcnRzLmxvYWRlcnMgPSBsb2FkZXJzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9zd2lnLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKSxcbiAgc3RyaW5ncyA9IFsnaHRtbCcsICdqcyddO1xuXG4vKipcbiAqIENvbnRyb2wgYXV0by1lc2NhcGluZyBvZiB2YXJpYWJsZSBvdXRwdXQgZnJvbSB3aXRoaW4geW91ciB0ZW1wbGF0ZXMuXG4gKlxuICogQGFsaWFzIGF1dG9lc2NhcGVcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXl2YXIgPSAnPGZvbz4nO1xuICogeyUgYXV0b2VzY2FwZSB0cnVlICV9e3sgbXl2YXIgfX17JSBlbmRhdXRvZXNjYXBlICV9XG4gKiAvLyA9PiAmbHQ7Zm9vJmd0O1xuICogeyUgYXV0b2VzY2FwZSBmYWxzZSAlfXt7IG15dmFyIH19eyUgZW5kYXV0b2VzY2FwZSAlfVxuICogLy8gPT4gPGZvbz5cbiAqXG4gKiBAcGFyYW0ge2Jvb2xlYW58c3RyaW5nfSBjb250cm9sIE9uZSBvZiBgdHJ1ZWAsIGBmYWxzZWAsIGBcImpzXCJgIG9yIGBcImh0bWxcImAuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHJldHVybiBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpO1xufTtcbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaywgb3B0cykge1xuICB2YXIgbWF0Y2hlZDtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFtYXRjaGVkICYmXG4gICAgICAgICh0b2tlbi50eXBlID09PSB0eXBlcy5CT09MIHx8XG4gICAgICAgICAgKHRva2VuLnR5cGUgPT09IHR5cGVzLlNUUklORyAmJiBzdHJpbmdzLmluZGV4T2YodG9rZW4ubWF0Y2gpID09PSAtMSkpXG4gICAgICAgICkge1xuICAgICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCB0b2tlbiBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBpbiBhdXRvZXNjYXBlIHRhZycsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2F1dG9lc2NhcGUuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogRGVmaW5lcyBhIGJsb2NrIGluIGEgdGVtcGxhdGUgdGhhdCBjYW4gYmUgb3ZlcnJpZGRlbiBieSBhIHRlbXBsYXRlIGV4dGVuZGluZyB0aGlzIG9uZSBhbmQvb3Igd2lsbCBvdmVycmlkZSB0aGUgY3VycmVudCB0ZW1wbGF0ZSdzIHBhcmVudCB0ZW1wbGF0ZSBibG9jayBvZiB0aGUgc2FtZSBuYW1lLlxuICpcbiAqIFNlZSA8YSBocmVmPVwiI2luaGVyaXRhbmNlXCI+VGVtcGxhdGUgSW5oZXJpdGFuY2U8L2E+IGZvciBtb3JlIGluZm9ybWF0aW9uLlxuICpcbiAqIEBhbGlhcyBibG9ja1xuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBibG9jayBib2R5ICV9Li4ueyUgZW5kYmxvY2sgJX1cbiAqXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICBuYW1lICAgTmFtZSBvZiB0aGUgYmxvY2sgZm9yIHVzZSBpbiBwYXJlbnQgYW5kIGV4dGVuZGVkIHRlbXBsYXRlcy5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zKSB7XG4gIHJldHVybiBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBhcmdzLmpvaW4oJycpKTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIpIHtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5leHBvcnRzLmJsb2NrID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9ibG9jay5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBVc2VkIHdpdGhpbiBhbiA8Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGlmICV9PC9jb2RlPiB0YWcsIHRoZSBjb2RlIGJsb2NrIGZvbGxvd2luZyB0aGlzIHRhZyB1cCB1bnRpbCA8Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGVuZGlmICV9PC9jb2RlPiB3aWxsIGJlIHJlbmRlcmVkIGlmIHRoZSA8aT5pZjwvaT4gc3RhdGVtZW50IHJldHVybnMgZmFsc2UuXG4gKlxuICogQGFsaWFzIGVsc2VcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgZmFsc2UgJX1cbiAqICAgc3RhdGVtZW50MVxuICogeyUgZWxzZSAlfVxuICogICBzdGF0ZW1lbnQyXG4gKiB7JSBlbmRpZiAlfVxuICogLy8gPT4gc3RhdGVtZW50MlxuICpcbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gJ30gZWxzZSB7XFxuJztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaykge1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiZWxzZVwiIHRhZyBkb2VzIG5vdCBhY2NlcHQgYW55IHRva2Vucy4gRm91bmQgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuXG4gIHJldHVybiAoc3RhY2subGVuZ3RoICYmIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLm5hbWUgPT09ICdpZicpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgaWZwYXJzZXIgPSByZXF1aXJlKCcuL2lmJykucGFyc2U7XG5cbi8qKlxuICogTGlrZSA8Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGVsc2UgJX08L2NvZGU+LCBleGNlcHQgdGhpcyB0YWcgY2FuIHRha2UgbW9yZSBjb25kaXRpb25hbCBzdGF0ZW1lbnRzLlxuICpcbiAqIEBhbGlhcyBlbHNlaWZcbiAqIEBhbGlhcyBlbGlmXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIGZhbHNlICV9XG4gKiAgIFRhY29zXG4gKiB7JSBlbHNlaWYgdHJ1ZSAlfVxuICogICBCdXJyaXRvc1xuICogeyUgZWxzZSAlfVxuICogICBDaHVycm9zXG4gKiB7JSBlbmRpZiAlfVxuICogLy8gPT4gQnVycml0b3NcbiAqXG4gKiBAcGFyYW0gey4uLm1peGVkfSBjb25kaXRpb25hbCAgQ29uZGl0aW9uYWwgc3RhdGVtZW50IHRoYXQgcmV0dXJucyBhIHRydXRoeSBvciBmYWxzeSB2YWx1ZS5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzKSB7XG4gIHJldHVybiAnfSBlbHNlIGlmICgnICsgYXJncy5qb2luKCcgJykgKyAnKSB7XFxuJztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaykge1xuICB2YXIgb2theSA9IGlmcGFyc2VyKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2spO1xuICByZXR1cm4gb2theSAmJiAoc3RhY2subGVuZ3RoICYmIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLm5hbWUgPT09ICdpZicpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlaWYuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogTWFrZXMgdGhlIGN1cnJlbnQgdGVtcGxhdGUgZXh0ZW5kIGEgcGFyZW50IHRlbXBsYXRlLiBUaGlzIHRhZyBtdXN0IGJlIHRoZSBmaXJzdCBpdGVtIGluIHlvdXIgdGVtcGxhdGUuXG4gKlxuICogU2VlIDxhIGhyZWY9XCIjaW5oZXJpdGFuY2VcIj5UZW1wbGF0ZSBJbmhlcml0YW5jZTwvYT4gZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gKlxuICogQGFsaWFzIGV4dGVuZHNcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgZXh0ZW5kcyBcIi4vbGF5b3V0Lmh0bWxcIiAlfVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXJlbnRGaWxlICBSZWxhdGl2ZSBwYXRoIHRvIHRoZSBmaWxlIHRoYXQgdGhpcyB0ZW1wbGF0ZSBleHRlbmRzLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoKSB7fTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSBmYWxzZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9leHRlbmRzLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgZmlsdGVycyA9IHJlcXVpcmUoJy4uL2ZpbHRlcnMnKTtcblxuLyoqXG4gKiBBcHBseSBhIGZpbHRlciB0byBhbiBlbnRpcmUgYmxvY2sgb2YgdGVtcGxhdGUuXG4gKlxuICogQGFsaWFzIGZpbHRlclxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBmaWx0ZXIgdXBwZXJjYXNlICV9b2ggaGksIHt7IG5hbWUgfX17JSBlbmRmaWx0ZXIgJX1cbiAqIC8vID0+IE9IIEhJLCBQQVVMXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGZpbHRlciByZXBsYWNlKFwiLlwiLCBcIiFcIiwgXCJnXCIpICV9SGkuIE15IG5hbWUgaXMgUGF1bC57JSBlbmRmaWx0ZXIgJX1cbiAqIC8vID0+IEhpISBNeSBuYW1lIGlzIFBhdWwhXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZmlsdGVyICBUaGUgZmlsdGVyIHRoYXQgc2hvdWxkIGJlIGFwcGxpZWQgdG8gdGhlIGNvbnRlbnRzIG9mIHRoZSB0YWcuXG4gKi9cblxuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgdmFyIGZpbHRlciA9IGFyZ3Muc2hpZnQoKS5yZXBsYWNlKC9cXCgkLywgJycpLFxuICAgIHZhbCA9ICcoZnVuY3Rpb24gKCkge1xcbicgK1xuICAgICAgJyAgdmFyIF9vdXRwdXQgPSBcIlwiO1xcbicgK1xuICAgICAgY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSArXG4gICAgICAnICByZXR1cm4gX291dHB1dDtcXG4nICtcbiAgICAgICd9KSgpJztcblxuICBpZiAoYXJnc1thcmdzLmxlbmd0aCAtIDFdID09PSAnKScpIHtcbiAgICBhcmdzLnBvcCgpO1xuICB9XG5cbiAgYXJncyA9IChhcmdzLmxlbmd0aCkgPyAnLCAnICsgYXJncy5qb2luKCcnKSA6ICcnO1xuICByZXR1cm4gJ19vdXRwdXQgKz0gX2ZpbHRlcnNbXCInICsgZmlsdGVyICsgJ1wiXSgnICsgdmFsICsgYXJncyArICcpO1xcbic7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcykge1xuICB2YXIgZmlsdGVyO1xuXG4gIGZ1bmN0aW9uIGNoZWNrKGZpbHRlcikge1xuICAgIGlmICghZmlsdGVycy5oYXNPd25Qcm9wZXJ0eShmaWx0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbHRlciBcIicgKyBmaWx0ZXIgKyAnXCIgZG9lcyBub3QgZXhpc3Qgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICB9XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkZVTkNUSU9OLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIWZpbHRlcikge1xuICAgICAgZmlsdGVyID0gdG9rZW4ubWF0Y2gucmVwbGFjZSgvXFwoJC8sICcnKTtcbiAgICAgIGNoZWNrKGZpbHRlcik7XG4gICAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIHRoaXMuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghZmlsdGVyKSB7XG4gICAgICBmaWx0ZXIgPSB0b2tlbi5tYXRjaDtcbiAgICAgIGNoZWNrKGZpbHRlcik7XG4gICAgICB0aGlzLm91dC5wdXNoKGZpbHRlcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZmlsdGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgY3R4ID0gJ19jdHguJyxcbiAgY3R4bG9vcCA9IGN0eCArICdsb29wJyxcbiAgY3R4bG9vcGNhY2hlID0gY3R4ICsgJ19fX2xvb3BjYWNoZSc7XG5cbi8qKlxuICogTG9vcCBvdmVyIG9iamVjdHMgYW5kIGFycmF5cy5cbiAqXG4gKiBAYWxpYXMgZm9yXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG9iaiA9IHsgb25lOiAnaGknLCB0d286ICdieWUnIH07XG4gKiB7JSBmb3IgeCBpbiBvYmogJX1cbiAqICAgeyUgaWYgbG9vcC5maXJzdCAlfTx1bD57JSBlbmRpZiAlfVxuICogICA8bGk+e3sgbG9vcC5pbmRleCB9fSAtIHt7IGxvb3Aua2V5IH19OiB7eyB4IH19PC9saT5cbiAqICAgeyUgaWYgbG9vcC5sYXN0ICV9PC91bD57JSBlbmRpZiAlfVxuICogeyUgZW5kZm9yICV9XG4gKiAvLyA9PiA8dWw+XG4gKiAvLyAgICA8bGk+MSAtIG9uZTogaGk8L2xpPlxuICogLy8gICAgPGxpPjIgLSB0d286IGJ5ZTwvbGk+XG4gKiAvLyAgICA8L3VsPlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBhcnIgPSBbMSwgMiwgM11cbiAqIC8vIFJldmVyc2UgdGhlIGFycmF5LCBzaG9ydGN1dCB0aGUga2V5L2luZGV4IHRvIGBrZXlgXG4gKiB7JSBmb3Iga2V5LCB2YWwgaW4gYXJyfHJldmVyc2UgJX1cbiAqIHt7IGtleSB9fSAtLSB7eyB2YWwgfX1cbiAqIHslIGVuZGZvciAlfVxuICogLy8gPT4gMCAtLSAzXG4gKiAvLyAgICAxIC0tIDJcbiAqIC8vICAgIDIgLS0gMVxuICpcbiAqIEBwYXJhbSB7bGl0ZXJhbH0gW2tleV0gICAgIEEgc2hvcnRjdXQgdG8gdGhlIGluZGV4IG9mIHRoZSBhcnJheSBvciBjdXJyZW50IGtleSBhY2Nlc3Nvci5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gdmFyaWFibGUgIFRoZSBjdXJyZW50IHZhbHVlIHdpbGwgYmUgYXNzaWduZWQgdG8gdGhpcyB2YXJpYWJsZSBuYW1lIHRlbXBvcmFyaWx5LiBUaGUgdmFyaWFibGUgd2lsbCBiZSByZXNldCB1cG9uIGVuZGluZyB0aGUgZm9yIHRhZy5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gaW4gICAgICAgIExpdGVyYWxseSwgXCJpblwiLiBUaGlzIHRva2VuIGlzIHJlcXVpcmVkLlxuICogQHBhcmFtIHtvYmplY3R9ICBvYmplY3QgICAgQW4gZW51bWVyYWJsZSBvYmplY3QgdGhhdCB3aWxsIGJlIGl0ZXJhdGVkIG92ZXIuXG4gKlxuICogQHJldHVybiB7bG9vcC5pbmRleH0gVGhlIGN1cnJlbnQgaXRlcmF0aW9uIG9mIHRoZSBsb29wICgxLWluZGV4ZWQpXG4gKiBAcmV0dXJuIHtsb29wLmluZGV4MH0gVGhlIGN1cnJlbnQgaXRlcmF0aW9uIG9mIHRoZSBsb29wICgwLWluZGV4ZWQpXG4gKiBAcmV0dXJuIHtsb29wLnJldmluZGV4fSBUaGUgbnVtYmVyIG9mIGl0ZXJhdGlvbnMgZnJvbSB0aGUgZW5kIG9mIHRoZSBsb29wICgxLWluZGV4ZWQpXG4gKiBAcmV0dXJuIHtsb29wLnJldmluZGV4MH0gVGhlIG51bWJlciBvZiBpdGVyYXRpb25zIGZyb20gdGhlIGVuZCBvZiB0aGUgbG9vcCAoMC1pbmRleGVkKVxuICogQHJldHVybiB7bG9vcC5rZXl9IElmIHRoZSBpdGVyYXRvciBpcyBhbiBvYmplY3QsIHRoaXMgd2lsbCBiZSB0aGUga2V5IG9mIHRoZSBjdXJyZW50IGl0ZW0sIG90aGVyd2lzZSBpdCB3aWxsIGJlIHRoZSBzYW1lIGFzIHRoZSBsb29wLmluZGV4LlxuICogQHJldHVybiB7bG9vcC5maXJzdH0gVHJ1ZSBpZiB0aGUgY3VycmVudCBvYmplY3QgaXMgdGhlIGZpcnN0IGluIHRoZSBvYmplY3Qgb3IgYXJyYXkuXG4gKiBAcmV0dXJuIHtsb29wLmxhc3R9IFRydWUgaWYgdGhlIGN1cnJlbnQgb2JqZWN0IGlzIHRoZSBsYXN0IGluIHRoZSBvYmplY3Qgb3IgYXJyYXkuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHZhciB2YWwgPSBhcmdzLnNoaWZ0KCksXG4gICAga2V5ID0gJ19faycsXG4gICAgbGFzdDtcblxuICBpZiAoYXJnc1swXSAmJiBhcmdzWzBdID09PSAnLCcpIHtcbiAgICBhcmdzLnNoaWZ0KCk7XG4gICAga2V5ID0gdmFsO1xuICAgIHZhbCA9IGFyZ3Muc2hpZnQoKTtcbiAgfVxuXG4gIGxhc3QgPSBhcmdzLmpvaW4oJycpO1xuXG4gIHJldHVybiBbXG4gICAgJyhmdW5jdGlvbiAoKSB7XFxuJyxcbiAgICAnICB2YXIgX19sID0gJyArIGxhc3QgKyAnLCBfX2xlbiA9IChfdXRpbHMuaXNBcnJheShfX2wpKSA/IF9fbC5sZW5ndGggOiBfdXRpbHMua2V5cyhfX2wpLmxlbmd0aDtcXG4nLFxuICAgICcgIGlmICghX19sKSB7IHJldHVybjsgfVxcbicsXG4gICAgJyAgJyArIGN0eGxvb3BjYWNoZSArICcgPSB7IGxvb3A6ICcgKyBjdHhsb29wICsgJywgJyArIHZhbCArICc6ICcgKyBjdHggKyB2YWwgKyAnLCAnICsga2V5ICsgJzogJyArIGN0eCArIGtleSArICcgfTtcXG4nLFxuICAgICcgICcgKyBjdHhsb29wICsgJyA9IHsgZmlyc3Q6IGZhbHNlLCBpbmRleDogMSwgaW5kZXgwOiAwLCByZXZpbmRleDogX19sZW4sIHJldmluZGV4MDogX19sZW4gLSAxLCBsZW5ndGg6IF9fbGVuLCBsYXN0OiBmYWxzZSB9O1xcbicsXG4gICAgJyAgX3V0aWxzLmVhY2goX19sLCBmdW5jdGlvbiAoJyArIHZhbCArICcsICcgKyBrZXkgKyAnKSB7XFxuJyxcbiAgICAnICAgICcgKyBjdHggKyB2YWwgKyAnID0gJyArIHZhbCArICc7XFxuJyxcbiAgICAnICAgICcgKyBjdHggKyBrZXkgKyAnID0gJyArIGtleSArICc7XFxuJyxcbiAgICAnICAgICcgKyBjdHhsb29wICsgJy5rZXkgPSAnICsga2V5ICsgJztcXG4nLFxuICAgICcgICAgJyArIGN0eGxvb3AgKyAnLmZpcnN0ID0gKCcgKyBjdHhsb29wICsgJy5pbmRleDAgPT09IDApO1xcbicsXG4gICAgJyAgICAnICsgY3R4bG9vcCArICcubGFzdCA9ICgnICsgY3R4bG9vcCArICcucmV2aW5kZXgwID09PSAwKTtcXG4nLFxuICAgICcgICAgJyArIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSksXG4gICAgJyAgICAnICsgY3R4bG9vcCArICcuaW5kZXggKz0gMTsgJyArIGN0eGxvb3AgKyAnLmluZGV4MCArPSAxOyAnICsgY3R4bG9vcCArICcucmV2aW5kZXggLT0gMTsgJyArIGN0eGxvb3AgKyAnLnJldmluZGV4MCAtPSAxO1xcbicsXG4gICAgJyAgfSk7XFxuJyxcbiAgICAnICAnICsgY3R4bG9vcCArICcgPSAnICsgY3R4bG9vcGNhY2hlICsgJy5sb29wO1xcbicsXG4gICAgJyAgJyArIGN0eCArIHZhbCArICcgPSAnICsgY3R4bG9vcGNhY2hlICsgJy4nICsgdmFsICsgJztcXG4nLFxuICAgICcgICcgKyBjdHggKyBrZXkgKyAnID0gJyArIGN0eGxvb3BjYWNoZSArICcuJyArIGtleSArICc7XFxuJyxcbiAgICAnfSkoKTtcXG4nXG4gIF0uam9pbignJyk7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcykge1xuICB2YXIgZmlyc3RWYXIsIHJlYWR5O1xuXG4gIHBhcnNlci5vbih0eXBlcy5OVU1CRVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciBsYXN0U3RhdGUgPSB0aGlzLnN0YXRlLmxlbmd0aCA/IHRoaXMuc3RhdGVbdGhpcy5zdGF0ZS5sZW5ndGggLSAxXSA6IG51bGw7XG4gICAgaWYgKCFyZWFkeSB8fFxuICAgICAgICAobGFzdFN0YXRlICE9PSB0eXBlcy5BUlJBWU9QRU4gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IHR5cGVzLkNVUkxZT1BFTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gdHlwZXMuQ1VSTFlDTE9TRSAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gdHlwZXMuRlVOQ1RJT04gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IHR5cGVzLkZJTFRFUilcbiAgICAgICAgKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbnVtYmVyIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHJlYWR5ICYmIGZpcnN0VmFyKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMub3V0Lmxlbmd0aCkge1xuICAgICAgZmlyc3RWYXIgPSB0cnVlO1xuICAgIH1cblxuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQ09NTUEsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmIChmaXJzdFZhciAmJiB0aGlzLnByZXZUb2tlbi50eXBlID09PSB0eXBlcy5WQVIpIHtcbiAgICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQ09NUEFSQVRPUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHRva2VuLm1hdGNoICE9PSAnaW4nIHx8ICFmaXJzdFZhcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHRva2VuIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICByZWFkeSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9mb3IuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogVXNlZCB0byBjcmVhdGUgY29uZGl0aW9uYWwgc3RhdGVtZW50cyBpbiB0ZW1wbGF0ZXMuIEFjY2VwdHMgbW9zdCBKYXZhU2NyaXB0IHZhbGlkIGNvbXBhcmlzb25zLlxuICpcbiAqIENhbiBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggPGEgaHJlZj1cIiNlbHNlaWZcIj48Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGVsc2VpZiAuLi4gJX08L2NvZGU+PC9hPiBhbmQgPGEgaHJlZj1cIiNlbHNlXCI+PGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBlbHNlICV9PC9jb2RlPjwvYT4gdGFncy5cbiAqXG4gKiBAYWxpYXMgaWZcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeCAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiAheCAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiBub3QgeCAlfXslIGVuZGlmICV9XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHggYW5kIHkgJX17JSBlbmRpZiAlfVxuICogeyUgaWYgeCAmJiB5ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmIHggb3IgeSAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiB4IHx8IHkgJX17JSBlbmRpZiAlfVxuICogeyUgaWYgeCB8fCAoeSAmJiB6KSAlfXslIGVuZGlmICV9XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHggW29wZXJhdG9yXSB5ICV9XG4gKiAgIE9wZXJhdG9yczogPT0sICE9LCA8LCA8PSwgPiwgPj0sID09PSwgIT09XG4gKiB7JSBlbmRpZiAlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4ID09ICdmaXZlJyAlfVxuICogICBUaGUgb3BlcmFuZHMgY2FuIGJlIGFsc28gYmUgc3RyaW5nIG9yIG51bWJlciBsaXRlcmFsc1xuICogeyUgZW5kaWYgJX1cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeHxsb3dlciA9PT0gJ3RhY29zJyAlfVxuICogICBZb3UgY2FuIHVzZSBmaWx0ZXJzIG9uIGFueSBvcGVyYW5kIGluIHRoZSBzdGF0ZW1lbnQuXG4gKiB7JSBlbmRpZiAlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4IGluIHkgJX1cbiAqICAgSWYgeCBpcyBhIHZhbHVlIHRoYXQgaXMgcHJlc2VudCBpbiB5LCB0aGlzIHdpbGwgcmV0dXJuIHRydWUuXG4gKiB7JSBlbmRpZiAlfVxuICpcbiAqIEBwYXJhbSB7Li4ubWl4ZWR9IGNvbmRpdGlvbmFsIENvbmRpdGlvbmFsIHN0YXRlbWVudCB0aGF0IHJldHVybnMgYSB0cnV0aHkgb3IgZmFsc3kgdmFsdWUuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHJldHVybiAnaWYgKCcgKyBhcmdzLmpvaW4oJyAnKSArICcpIHsgXFxuJyArXG4gICAgY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSArICdcXG4nICtcbiAgICAnfSc7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcykge1xuICBwYXJzZXIub24odHlwZXMuQ09NUEFSQVRPUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHRoaXMuaXNMYXN0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbG9naWMgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIGlmICh0aGlzLnByZXZUb2tlbi50eXBlID09PSB0eXBlcy5OT1QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQXR0ZW1wdGVkIGxvZ2ljIFwibm90ICcgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4gVXNlICEoZm9vICcgKyB0b2tlbi5tYXRjaCArICcpIGluc3RlYWQuJyk7XG4gICAgfVxuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuTk9ULCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAodGhpcy5pc0xhc3QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBsb2dpYyBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5CT09MLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkxPR0lDLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIXRoaXMub3V0Lmxlbmd0aCB8fCB0aGlzLmlzTGFzdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGxvZ2ljIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICB0aGlzLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaWYuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogQWxsb3dzIHlvdSB0byBpbXBvcnQgbWFjcm9zIGZyb20gYW5vdGhlciBmaWxlIGRpcmVjdGx5IGludG8geW91ciBjdXJyZW50IGNvbnRleHQuXG4gKiBUaGUgaW1wb3J0IHRhZyBpcyBzcGVjaWZpY2FsbHkgZGVzaWduZWQgZm9yIGltcG9ydGluZyBtYWNyb3MgaW50byB5b3VyIHRlbXBsYXRlIHdpdGggYSBzcGVjaWZpYyBjb250ZXh0IHNjb3BlLiBUaGlzIGlzIHZlcnkgdXNlZnVsIGZvciBrZWVwaW5nIHlvdXIgbWFjcm9zIGZyb20gb3ZlcnJpZGluZyB0ZW1wbGF0ZSBjb250ZXh0IHRoYXQgaXMgYmVpbmcgaW5qZWN0ZWQgYnkgeW91ciBzZXJ2ZXItc2lkZSBwYWdlIGdlbmVyYXRpb24uXG4gKlxuICogQGFsaWFzIGltcG9ydFxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpbXBvcnQgJy4vZm9ybW1hY3Jvcy5odG1sJyBhcyBmb3JtcyAlfVxuICoge3sgZm9ybS5pbnB1dChcInRleHRcIiwgXCJuYW1lXCIpIH19XG4gKiAvLyA9PiA8aW5wdXQgdHlwZT1cInRleHRcIiBuYW1lPVwibmFtZVwiPlxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpbXBvcnQgXCIuLi9zaGFyZWQvdGFncy5odG1sXCIgYXMgdGFncyAlfVxuICoge3sgdGFncy5zdHlsZXNoZWV0KCdnbG9iYWwnKSB9fVxuICogLy8gPT4gPGxpbmsgcmVsPVwic3R5bGVzaGVldFwiIGhyZWY9XCIvZ2xvYmFsLmNzc1wiPlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfHZhcn0gIGZpbGUgICAgICBSZWxhdGl2ZSBwYXRoIGZyb20gdGhlIGN1cnJlbnQgdGVtcGxhdGUgZmlsZSB0byB0aGUgZmlsZSB0byBpbXBvcnQgbWFjcm9zIGZyb20uXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICAgICBhcyAgICAgICAgTGl0ZXJhbGx5LCBcImFzXCIuXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICAgICB2YXJuYW1lICAgTG9jYWwtYWNjZXNzaWJsZSBvYmplY3QgbmFtZSB0byBhc3NpZ24gdGhlIG1hY3JvcyB0by5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzKSB7XG4gIHZhciBjdHggPSBhcmdzLnBvcCgpLFxuICAgIG91dCA9ICdfY3R4LicgKyBjdHggKyAnID0ge307XFxuICB2YXIgX291dHB1dCA9IFwiXCI7XFxuJyxcbiAgICByZXBsYWNlbWVudHMgPSB1dGlscy5tYXAoYXJncywgZnVuY3Rpb24gKGFyZykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZXg6IG5ldyBSZWdFeHAoJ19jdHguJyArIGFyZy5uYW1lLCAnZycpLFxuICAgICAgICByZTogJ19jdHguJyArIGN0eCArICcuJyArIGFyZy5uYW1lXG4gICAgICB9O1xuICAgIH0pO1xuXG4gIC8vIFJlcGxhY2UgYWxsIG9jY3VycmVuY2VzIG9mIGFsbCBtYWNyb3MgaW4gdGhpcyBmaWxlIHdpdGhcbiAgLy8gcHJvcGVyIG5hbWVzcGFjZWQgZGVmaW5pdGlvbnMgYW5kIGNhbGxzXG4gIHV0aWxzLmVhY2goYXJncywgZnVuY3Rpb24gKGFyZykge1xuICAgIHZhciBjID0gYXJnLmNvbXBpbGVkO1xuICAgIHV0aWxzLmVhY2gocmVwbGFjZW1lbnRzLCBmdW5jdGlvbiAocmUpIHtcbiAgICAgIGMgPSBjLnJlcGxhY2UocmUuZXgsIHJlLnJlKTtcbiAgICB9KTtcbiAgICBvdXQgKz0gYztcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaywgb3B0cykge1xuICB2YXIgcGFyc2VGaWxlID0gcmVxdWlyZSgnLi4vc3dpZycpLnBhcnNlRmlsZSxcbiAgICBjb21waWxlciA9IHJlcXVpcmUoJy4uL3BhcnNlcicpLmNvbXBpbGUsXG4gICAgcGFyc2VPcHRzID0geyByZXNvbHZlRnJvbTogb3B0cy5maWxlbmFtZSB9LFxuICAgIGNvbXBpbGVPcHRzID0gdXRpbHMuZXh0ZW5kKHt9LCBvcHRzLCBwYXJzZU9wdHMpLFxuICAgIHRva2VucyxcbiAgICBjdHg7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlNUUklORywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghdG9rZW5zKSB7XG4gICAgICB0b2tlbnMgPSBwYXJzZUZpbGUodG9rZW4ubWF0Y2gucmVwbGFjZSgvXihcInwnKXwoXCJ8JykkL2csICcnKSwgcGFyc2VPcHRzKS50b2tlbnM7XG4gICAgICB1dGlscy5lYWNoKHRva2VucywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICAgIHZhciBvdXQgPSAnJyxcbiAgICAgICAgICBtYWNyb05hbWU7XG4gICAgICAgIGlmICghdG9rZW4gfHwgdG9rZW4ubmFtZSAhPT0gJ21hY3JvJyB8fCAhdG9rZW4uY29tcGlsZSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBtYWNyb05hbWUgPSB0b2tlbi5hcmdzWzBdO1xuICAgICAgICBvdXQgKz0gdG9rZW4uY29tcGlsZShjb21waWxlciwgdG9rZW4uYXJncywgdG9rZW4uY29udGVudCwgW10sIGNvbXBpbGVPcHRzKSArICdcXG4nO1xuICAgICAgICBzZWxmLm91dC5wdXNoKHtjb21waWxlZDogb3V0LCBuYW1lOiBtYWNyb05hbWV9KTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBzdHJpbmcgJyArIHRva2VuLm1hdGNoICsgJyBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghdG9rZW5zIHx8IGN0eCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHZhcmlhYmxlIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cblxuICAgIGlmICh0b2tlbi5tYXRjaCA9PT0gJ2FzJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGN0eCA9IHRva2VuLm1hdGNoO1xuICAgIHNlbGYub3V0LnB1c2goY3R4KTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5ibG9jayA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW1wb3J0LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgaWdub3JlID0gJ2lnbm9yZScsXG4gIG1pc3NpbmcgPSAnbWlzc2luZycsXG4gIG9ubHkgPSAnb25seSc7XG5cbi8qKlxuICogSW5jbHVkZXMgYSB0ZW1wbGF0ZSBwYXJ0aWFsIGluIHBsYWNlLiBUaGUgdGVtcGxhdGUgaXMgcmVuZGVyZWQgd2l0aGluIHRoZSBjdXJyZW50IGxvY2FscyB2YXJpYWJsZSBjb250ZXh0LlxuICpcbiAqIEBhbGlhcyBpbmNsdWRlXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGZvb2QgPSAnYnVycml0b3MnO1xuICogLy8gZHJpbmsgPSAnbGVtb25hZGUnO1xuICogeyUgaW5jbHVkZSBcIi4vcGFydGlhbC5odG1sXCIgJX1cbiAqIC8vID0+IEkgbGlrZSBidXJyaXRvcyBhbmQgbGVtb25hZGUuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X29iaiA9IHsgZm9vZDogJ3RhY29zJywgZHJpbms6ICdob3JjaGF0YScgfTtcbiAqIHslIGluY2x1ZGUgXCIuL3BhcnRpYWwuaHRtbFwiIHdpdGggbXlfb2JqIG9ubHkgJX1cbiAqIC8vID0+IEkgbGlrZSB0YWNvcyBhbmQgaG9yY2hhdGEuXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGluY2x1ZGUgXCIvdGhpcy9maWxlL2RvZXMvbm90L2V4aXN0XCIgaWdub3JlIG1pc3NpbmcgJX1cbiAqIC8vID0+IChOb3RoaW5nISBlbXB0eSBzdHJpbmcpXG4gKlxuICogQHBhcmFtIHtzdHJpbmd8dmFyfSAgZmlsZSAgICAgIFRoZSBwYXRoLCByZWxhdGl2ZSB0byB0aGUgdGVtcGxhdGUgcm9vdCwgdG8gcmVuZGVyIGludG8gdGhlIGN1cnJlbnQgY29udGV4dC5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gICAgIFt3aXRoXSAgICBMaXRlcmFsbHksIFwid2l0aFwiLlxuICogQHBhcmFtIHtvYmplY3R9ICAgICAgW2NvbnRleHRdIExvY2FsIHZhcmlhYmxlIGtleS12YWx1ZSBvYmplY3QgY29udGV4dCB0byBwcm92aWRlIHRvIHRoZSBpbmNsdWRlZCBmaWxlLlxuICogQHBhcmFtIHtsaXRlcmFsfSAgICAgW29ubHldICAgIFJlc3RyaWN0cyB0byA8c3Ryb25nPm9ubHk8L3N0cm9uZz4gcGFzc2luZyB0aGUgPGNvZGU+d2l0aCBjb250ZXh0PC9jb2RlPiBhcyBsb2NhbCB2YXJpYWJsZXPigJN0aGUgaW5jbHVkZWQgdGVtcGxhdGUgd2lsbCBub3QgYmUgYXdhcmUgb2YgYW55IG90aGVyIGxvY2FsIHZhcmlhYmxlcyBpbiB0aGUgcGFyZW50IHRlbXBsYXRlLiBGb3IgYmVzdCBwZXJmb3JtYW5jZSwgdXNhZ2Ugb2YgdGhpcyBvcHRpb24gaXMgcmVjb21tZW5kZWQgaWYgcG9zc2libGUuXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICAgICBbaWdub3JlIG1pc3NpbmddIFdpbGwgb3V0cHV0IGVtcHR5IHN0cmluZyBpZiBub3QgZm91bmQgaW5zdGVhZCBvZiB0aHJvd2luZyBhbiBlcnJvci5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzKSB7XG4gIHZhciBmaWxlID0gYXJncy5zaGlmdCgpLFxuICAgIG9ubHlJZHggPSBhcmdzLmluZGV4T2Yob25seSksXG4gICAgb25seUN0eCA9IG9ubHlJZHggIT09IC0xID8gYXJncy5zcGxpY2Uob25seUlkeCwgMSkgOiBmYWxzZSxcbiAgICBwYXJlbnRGaWxlID0gKGFyZ3MucG9wKCkgfHwgJycpLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJyksXG4gICAgaWdub3JlID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdID09PSBtaXNzaW5nID8gKGFyZ3MucG9wKCkpIDogZmFsc2UsXG4gICAgdyA9IGFyZ3Muam9pbignJyk7XG5cbiAgcmV0dXJuIChpZ25vcmUgPyAnICB0cnkge1xcbicgOiAnJykgK1xuICAgICdfb3V0cHV0ICs9IF9zd2lnLmNvbXBpbGVGaWxlKCcgKyBmaWxlICsgJywgeycgK1xuICAgICdyZXNvbHZlRnJvbTogXCInICsgcGFyZW50RmlsZSArICdcIicgK1xuICAgICd9KSgnICtcbiAgICAoKG9ubHlDdHggJiYgdykgPyB3IDogKCF3ID8gJ19jdHgnIDogJ191dGlscy5leHRlbmQoe30sIF9jdHgsICcgKyB3ICsgJyknKSkgK1xuICAgICcpO1xcbicgK1xuICAgIChpZ25vcmUgPyAnfSBjYXRjaCAoZSkge31cXG4nIDogJycpO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrLCBvcHRzKSB7XG4gIHZhciBmaWxlLCB3O1xuICBwYXJzZXIub24odHlwZXMuU1RSSU5HLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIGZpbGUgPSB0b2tlbi5tYXRjaDtcbiAgICAgIHRoaXMub3V0LnB1c2goZmlsZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghZmlsZSkge1xuICAgICAgZmlsZSA9IHRva2VuLm1hdGNoO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCF3ICYmIHRva2VuLm1hdGNoID09PSAnd2l0aCcpIHtcbiAgICAgIHcgPSB0cnVlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh3ICYmIHRva2VuLm1hdGNoID09PSBvbmx5ICYmIHRoaXMucHJldlRva2VuLm1hdGNoICE9PSAnd2l0aCcpIHtcbiAgICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0b2tlbi5tYXRjaCA9PT0gaWdub3JlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRva2VuLm1hdGNoID09PSBtaXNzaW5nKSB7XG4gICAgICBpZiAodGhpcy5wcmV2VG9rZW4ubWF0Y2ggIT09IGlnbm9yZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdG9rZW4gXCInICsgbWlzc2luZyArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnByZXZUb2tlbi5tYXRjaCA9PT0gaWdub3JlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIFwiJyArIG1pc3NpbmcgKyAnXCIgb24gbGluZSAnICsgbGluZSArICcgYnV0IGZvdW5kIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiLicpO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLm91dC5wdXNoKG9wdHMuZmlsZW5hbWUgfHwgbnVsbCk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmNsdWRlLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5leHBvcnRzLmF1dG9lc2NhcGUgPSByZXF1aXJlKCcuL2F1dG9lc2NhcGUnKTtcbmV4cG9ydHMuYmxvY2sgPSByZXF1aXJlKCcuL2Jsb2NrJyk7XG5leHBvcnRzW1wiZWxzZVwiXSA9IHJlcXVpcmUoJy4vZWxzZScpO1xuZXhwb3J0cy5lbHNlaWYgPSByZXF1aXJlKCcuL2Vsc2VpZicpO1xuZXhwb3J0cy5lbGlmID0gZXhwb3J0cy5lbHNlaWY7XG5leHBvcnRzW1wiZXh0ZW5kc1wiXSA9IHJlcXVpcmUoJy4vZXh0ZW5kcycpO1xuZXhwb3J0cy5maWx0ZXIgPSByZXF1aXJlKCcuL2ZpbHRlcicpO1xuZXhwb3J0c1tcImZvclwiXSA9IHJlcXVpcmUoJy4vZm9yJyk7XG5leHBvcnRzW1wiaWZcIl0gPSByZXF1aXJlKCcuL2lmJyk7XG5leHBvcnRzW1wiaW1wb3J0XCJdID0gcmVxdWlyZSgnLi9pbXBvcnQnKTtcbmV4cG9ydHMuaW5jbHVkZSA9IHJlcXVpcmUoJy4vaW5jbHVkZScpO1xuZXhwb3J0cy5tYWNybyA9IHJlcXVpcmUoJy4vbWFjcm8nKTtcbmV4cG9ydHMucGFyZW50ID0gcmVxdWlyZSgnLi9wYXJlbnQnKTtcbmV4cG9ydHMucmF3ID0gcmVxdWlyZSgnLi9yYXcnKTtcbmV4cG9ydHMuc2V0ID0gcmVxdWlyZSgnLi9zZXQnKTtcbmV4cG9ydHMuc3BhY2VsZXNzID0gcmVxdWlyZSgnLi9zcGFjZWxlc3MnKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBDcmVhdGUgY3VzdG9tLCByZXVzYWJsZSBzbmlwcGV0cyB3aXRoaW4geW91ciB0ZW1wbGF0ZXMuXG4gKiBDYW4gYmUgaW1wb3J0ZWQgZnJvbSBvbmUgdGVtcGxhdGUgdG8gYW5vdGhlciB1c2luZyB0aGUgPGEgaHJlZj1cIiNpbXBvcnRcIj48Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGltcG9ydCAuLi4gJX08L2NvZGU+PC9hPiB0YWcuXG4gKlxuICogQGFsaWFzIG1hY3JvXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIG1hY3JvIGlucHV0KHR5cGUsIG5hbWUsIGlkLCBsYWJlbCwgdmFsdWUsIGVycm9yKSAlfVxuICogICA8bGFiZWwgZm9yPVwie3sgbmFtZSB9fVwiPnt7IGxhYmVsIH19PC9sYWJlbD5cbiAqICAgPGlucHV0IHR5cGU9XCJ7eyB0eXBlIH19XCIgbmFtZT1cInt7IG5hbWUgfX1cIiBpZD1cInt7IGlkIH19XCIgdmFsdWU9XCJ7eyB2YWx1ZSB9fVwieyUgaWYgZXJyb3IgJX0gY2xhc3M9XCJlcnJvclwieyUgZW5kaWYgJX0+XG4gKiB7JSBlbmRtYWNybyAlfVxuICpcbiAqIHt7IGlucHV0KFwidGV4dFwiLCBcImZuYW1lXCIsIFwiZm5hbWVcIiwgXCJGaXJzdCBOYW1lXCIsIGZuYW1lLnZhbHVlLCBmbmFtZS5lcnJvcnMpIH19XG4gKiAvLyA9PiA8bGFiZWwgZm9yPVwiZm5hbWVcIj5GaXJzdCBOYW1lPC9sYWJlbD5cbiAqIC8vICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIG5hbWU9XCJmbmFtZVwiIGlkPVwiZm5hbWVcIiB2YWx1ZT1cIlwiPlxuICpcbiAqIEBwYXJhbSB7Li4uYXJndW1lbnRzfSBhcmd1bWVudHMgIFVzZXItZGVmaW5lZCBhcmd1bWVudHMuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHZhciBmbk5hbWUgPSBhcmdzLnNoaWZ0KCk7XG5cbiAgcmV0dXJuICdfY3R4LicgKyBmbk5hbWUgKyAnID0gZnVuY3Rpb24gKCcgKyBhcmdzLmpvaW4oJycpICsgJykge1xcbicgK1xuICAgICcgIHZhciBfb3V0cHV0ID0gXCJcIjtcXG4nICtcbiAgICBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpICsgJ1xcbicgK1xuICAgICcgIHJldHVybiBfb3V0cHV0O1xcbicgK1xuICAgICd9O1xcbicgK1xuICAgICdfY3R4LicgKyBmbk5hbWUgKyAnLnNhZmUgPSB0cnVlO1xcbic7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcykge1xuICB2YXIgbmFtZTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAodG9rZW4ubWF0Y2guaW5kZXhPZignLicpICE9PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGRvdCBpbiBtYWNybyBhcmd1bWVudCBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5GVU5DVElPTiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFuYW1lKSB7XG4gICAgICBuYW1lID0gdG9rZW4ubWF0Y2g7XG4gICAgICB0aGlzLm91dC5wdXNoKG5hbWUpO1xuICAgICAgdGhpcy5zdGF0ZS5wdXNoKHR5cGVzLkZVTkNUSU9OKTtcbiAgICB9XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5GVU5DVElPTkVNUFRZLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIW5hbWUpIHtcbiAgICAgIG5hbWUgPSB0b2tlbi5tYXRjaDtcbiAgICAgIHRoaXMub3V0LnB1c2gobmFtZSk7XG4gICAgfVxuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuUEFSRU5DTE9TRSwgZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmlzTGFzdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcGFyZW50aGVzaXMgY2xvc2Ugb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5DT01NQSwgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5leHBvcnRzLmJsb2NrID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9tYWNyby5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBJbmplY3QgdGhlIGNvbnRlbnQgZnJvbSB0aGUgcGFyZW50IHRlbXBsYXRlJ3MgYmxvY2sgb2YgdGhlIHNhbWUgbmFtZSBpbnRvIHRoZSBjdXJyZW50IGJsb2NrLlxuICpcbiAqIFNlZSA8YSBocmVmPVwiI2luaGVyaXRhbmNlXCI+VGVtcGxhdGUgSW5oZXJpdGFuY2U8L2E+IGZvciBtb3JlIGluZm9ybWF0aW9uLlxuICpcbiAqIEBhbGlhcyBwYXJlbnRcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgZXh0ZW5kcyBcIi4vZm9vLmh0bWxcIiAlfVxuICogeyUgYmxvY2sgY29udGVudCAlfVxuICogICBNeSBjb250ZW50LlxuICogICB7JSBwYXJlbnQgJX1cbiAqIHslIGVuZGJsb2NrICV9XG4gKlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICBpZiAoIXBhcmVudHMgfHwgIXBhcmVudHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG5cbiAgdmFyIHBhcmVudEZpbGUgPSBhcmdzWzBdLFxuICAgIGJyZWFrZXIgPSB0cnVlLFxuICAgIGwgPSBwYXJlbnRzLmxlbmd0aCxcbiAgICBpID0gMCxcbiAgICBwYXJlbnQsXG4gICAgYmxvY2s7XG5cbiAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgcGFyZW50ID0gcGFyZW50c1tpXTtcbiAgICBpZiAoIXBhcmVudC5ibG9ja3MgfHwgIXBhcmVudC5ibG9ja3MuaGFzT3duUHJvcGVydHkoYmxvY2tOYW1lKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFNpbGx5IEpTTGludCBcIlN0cmFuZ2UgTG9vcFwiIHJlcXVpcmVzIHJldHVybiB0byBiZSBpbiBhIGNvbmRpdGlvbmFsXG4gICAgaWYgKGJyZWFrZXIgJiYgcGFyZW50RmlsZSAhPT0gcGFyZW50Lm5hbWUpIHtcbiAgICAgIGJsb2NrID0gcGFyZW50LmJsb2Nrc1tibG9ja05hbWVdO1xuICAgICAgcmV0dXJuIGJsb2NrLmNvbXBpbGUoY29tcGlsZXIsIFtibG9ja05hbWVdLCBibG9jay5jb250ZW50LCBwYXJlbnRzLnNsaWNlKGkgKyAxKSwgb3B0aW9ucykgKyAnXFxuJztcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaywgb3B0cykge1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgYXJndW1lbnQgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbignZW5kJywgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMub3V0LnB1c2gob3B0cy5maWxlbmFtZSk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9wYXJlbnQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIE1hZ2ljIHRhZywgaGFyZGNvZGVkIGludG8gcGFyc2VyXG5cbi8qKlxuICogRm9yY2VzIHRoZSBjb250ZW50IHRvIG5vdCBiZSBhdXRvLWVzY2FwZWQuIEFsbCBzd2lnIGluc3RydWN0aW9ucyB3aWxsIGJlIGlnbm9yZWQgYW5kIHRoZSBjb250ZW50IHdpbGwgYmUgcmVuZGVyZWQgZXhhY3RseSBhcyBpdCB3YXMgZ2l2ZW4uXG4gKlxuICogQGFsaWFzIHJhd1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBmb29iYXIgPSAnPHA+J1xuICogeyUgcmF3ICV9e3sgZm9vYmFyIH19eyUgZW5kcmF3ICV9XG4gKiAvLyA9PiB7eyBmb29iYXIgfX1cbiAqXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHJldHVybiBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpO1xufTtcbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIpIHtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHRva2VuIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIGluIHJhdyB0YWcgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3Jhdy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBTZXQgYSB2YXJpYWJsZSBmb3IgcmUtdXNlIGluIHRoZSBjdXJyZW50IGNvbnRleHQuIFRoaXMgd2lsbCBvdmVyLXdyaXRlIGFueSB2YWx1ZSBhbHJlYWR5IHNldCB0byB0aGUgY29udGV4dCBmb3IgdGhlIGdpdmVuIDx2YXI+dmFybmFtZTwvdmFyPi5cbiAqXG4gKiBAYWxpYXMgc2V0XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIHNldCBmb28gPSBcImFueXRoaW5nIVwiICV9XG4gKiB7eyBmb28gfX1cbiAqIC8vID0+IGFueXRoaW5nIVxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBpbmRleCA9IDI7XG4gKiB7JSBzZXQgYmFyID0gMSAlfVxuICogeyUgc2V0IGJhciArPSBpbmRleHxkZWZhdWx0KDMpICV9XG4gKiAvLyA9PiAzXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGZvb2RzID0ge307XG4gKiAvLyBmb29kID0gJ2NoaWxpJztcbiAqIHslIHNldCBmb29kc1tmb29kXSA9IFwiY29uIHF1ZXNvXCIgJX1cbiAqIHt7IGZvb2RzLmNoaWxpIH19XG4gKiAvLyA9PiBjb24gcXVlc29cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gZm9vZHMgPSB7IGNoaWxpOiAnY2hpbGkgY29uIHF1ZXNvJyB9XG4gKiB7JSBzZXQgZm9vZHMuY2hpbGkgPSBcImd1YXRhbWFsYW4gaW5zYW5pdHkgcGVwcGVyXCIgJX1cbiAqIHt7IGZvb2RzLmNoaWxpIH19XG4gKiAvLyA9PiBndWF0YW1hbGFuIGluc2FuaXR5IHBlcHBlclxuICpcbiAqIEBwYXJhbSB7bGl0ZXJhbH0gdmFybmFtZSAgIFRoZSB2YXJpYWJsZSBuYW1lIHRvIGFzc2lnbiB0aGUgdmFsdWUgdG8uXG4gKiBAcGFyYW0ge2xpdGVyYWx9IGFzc2lnbmVtZW50ICAgQW55IHZhbGlkIEphdmFTY3JpcHQgYXNzaWduZW1lbnQuIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPj0sICs9LCAqPSwgLz0sIC09PC9jb2RlPlxuICogQHBhcmFtIHsqfSAgIHZhbHVlICAgICBWYWxpZCB2YXJpYWJsZSBvdXRwdXQuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncykge1xuICByZXR1cm4gYXJncy5qb2luKCcgJykgKyAnO1xcbic7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcykge1xuICB2YXIgbmFtZVNldCA9ICcnLFxuICAgIHByb3BlcnR5TmFtZTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAocHJvcGVydHlOYW1lKSB7XG4gICAgICAvLyBUZWxsIHRoZSBwYXJzZXIgd2hlcmUgdG8gZmluZCB0aGUgdmFyaWFibGVcbiAgICAgIHByb3BlcnR5TmFtZSArPSAnX2N0eC4nICsgdG9rZW4ubWF0Y2g7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFwYXJzZXIub3V0Lmxlbmd0aCkge1xuICAgICAgbmFtZVNldCArPSB0b2tlbi5tYXRjaDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkJSQUNLRVRPUEVOLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIXByb3BlcnR5TmFtZSAmJiAhdGhpcy5vdXQubGVuZ3RoKSB7XG4gICAgICBwcm9wZXJ0eU5hbWUgPSB0b2tlbi5tYXRjaDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlNUUklORywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHByb3BlcnR5TmFtZSAmJiAhdGhpcy5vdXQubGVuZ3RoKSB7XG4gICAgICBwcm9wZXJ0eU5hbWUgKz0gdG9rZW4ubWF0Y2g7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5CUkFDS0VUQ0xPU0UsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmIChwcm9wZXJ0eU5hbWUgJiYgIXRoaXMub3V0Lmxlbmd0aCkge1xuICAgICAgbmFtZVNldCArPSBwcm9wZXJ0eU5hbWUgKyB0b2tlbi5tYXRjaDtcbiAgICAgIHByb3BlcnR5TmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkRPVEtFWSwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFwcm9wZXJ0eU5hbWUgJiYgIW5hbWVTZXQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBuYW1lU2V0ICs9ICcuJyArIHRva2VuLm1hdGNoO1xuICAgIHJldHVybjtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkFTU0lHTk1FTlQsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICh0aGlzLm91dC5sZW5ndGggfHwgIW5hbWVTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBhc3NpZ25tZW50IFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cblxuICAgIHRoaXMub3V0LnB1c2goXG4gICAgICAvLyBQcmV2ZW50IHRoZSBzZXQgZnJvbSBzcGlsbGluZyBpbnRvIGdsb2JhbCBzY29wZVxuICAgICAgJ19jdHguJyArIG5hbWVTZXRcbiAgICApO1xuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuYmxvY2sgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3NldC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBBdHRlbXB0cyB0byByZW1vdmUgd2hpdGVzcGFjZSBiZXR3ZWVuIEhUTUwgdGFncy4gVXNlIGF0IHlvdXIgb3duIHJpc2suXG4gKlxuICogQGFsaWFzIHNwYWNlbGVzc1xuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBzcGFjZWxlc3MgJX1cbiAqICAgeyUgZm9yIG51bSBpbiBmb28gJX1cbiAqICAgPGxpPnt7IGxvb3AuaW5kZXggfX08L2xpPlxuICogICB7JSBlbmRmb3IgJX1cbiAqIHslIGVuZHNwYWNlbGVzcyAlfVxuICogLy8gPT4gPGxpPjE8L2xpPjxsaT4yPC9saT48bGk+MzwvbGk+XG4gKlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICBmdW5jdGlvbiBzdHJpcFdoaXRlc3BhY2UodG9rZW5zKSB7XG4gICAgcmV0dXJuIHV0aWxzLm1hcCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgaWYgKHRva2VuLmNvbnRlbnQgfHwgdHlwZW9mIHRva2VuICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0b2tlbi5jb250ZW50ID0gc3RyaXBXaGl0ZXNwYWNlKHRva2VuLmNvbnRlbnQpO1xuICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0b2tlbi5yZXBsYWNlKC9eXFxzKy8sICcnKVxuICAgICAgICAucmVwbGFjZSgvPlxccys8L2csICc+PCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHMrJC8sICcnKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBjb21waWxlcihzdHJpcFdoaXRlc3BhY2UoY29udGVudCksIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSk7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyKSB7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB0b2tlbiBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3NwYWNlbGVzcy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlzQXJyYXk7XG5cbi8qKlxuICogU3RyaXAgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSBmcm9tIGEgc3RyaW5nLlxuICogQHBhcmFtICB7c3RyaW5nfSBpbnB1dFxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICBTdHJpcHBlZCBpbnB1dC5cbiAqL1xuZXhwb3J0cy5zdHJpcCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xufTtcblxuLyoqXG4gKiBUZXN0IGlmIGEgc3RyaW5nIHN0YXJ0cyB3aXRoIGEgZ2l2ZW4gcHJlZml4LlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHIgICAgU3RyaW5nIHRvIHRlc3QgYWdhaW5zdC5cbiAqIEBwYXJhbSAge3N0cmluZ30gcHJlZml4IFByZWZpeCB0byBjaGVjayBmb3IuXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5leHBvcnRzLnN0YXJ0c1dpdGggPSBmdW5jdGlvbiAoc3RyLCBwcmVmaXgpIHtcbiAgcmV0dXJuIHN0ci5pbmRleE9mKHByZWZpeCkgPT09IDA7XG59O1xuXG4vKipcbiAqIFRlc3QgaWYgYSBzdHJpbmcgZW5kcyB3aXRoIGEgZ2l2ZW4gc3VmZml4LlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHIgICAgU3RyaW5nIHRvIHRlc3QgYWdhaW5zdC5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3VmZml4IFN1ZmZpeCB0byBjaGVjayBmb3IuXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5leHBvcnRzLmVuZHNXaXRoID0gZnVuY3Rpb24gKHN0ciwgc3VmZml4KSB7XG4gIHJldHVybiBzdHIuaW5kZXhPZihzdWZmaXgsIHN0ci5sZW5ndGggLSBzdWZmaXgubGVuZ3RoKSAhPT0gLTE7XG59O1xuXG4vKipcbiAqIEl0ZXJhdGUgb3ZlciBhbiBhcnJheSBvciBvYmplY3QuXG4gKiBAcGFyYW0gIHthcnJheXxvYmplY3R9IG9iaiBFbnVtZXJhYmxlIG9iamVjdC5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gIENhbGxiYWNrIGZ1bmN0aW9uIGV4ZWN1dGVkIGZvciBlYWNoIGl0ZW0uXG4gKiBAcmV0dXJuIHthcnJheXxvYmplY3R9ICAgICBUaGUgb3JpZ2luYWwgaW5wdXQgb2JqZWN0LlxuICovXG5leHBvcnRzLmVhY2ggPSBmdW5jdGlvbiAob2JqLCBmbikge1xuICB2YXIgaSwgbDtcblxuICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgaSA9IDA7XG4gICAgbCA9IG9iai5sZW5ndGg7XG4gICAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgICBpZiAoZm4ob2JqW2ldLCBpLCBvYmopID09PSBmYWxzZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgICBpZiAoZm4ob2JqW2ldLCBpLCBvYmopID09PSBmYWxzZSkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbi8qKlxuICogVGVzdCBpZiBhbiBvYmplY3QgaXMgYW4gQXJyYXkuXG4gKiBAcGFyYW0ge29iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5ID0gKEFycmF5Lmhhc093blByb3BlcnR5KCdpc0FycmF5JykpID8gQXJyYXkuaXNBcnJheSA6IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIChvYmopID8gKHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopLmluZGV4T2YoKSAhPT0gLTEpIDogZmFsc2U7XG59O1xuXG4vKipcbiAqIFRlc3QgaWYgYW4gaXRlbSBpbiBhbiBlbnVtZXJhYmxlIG1hdGNoZXMgeW91ciBjb25kaXRpb25zLlxuICogQHBhcmFtICB7YXJyYXl8b2JqZWN0fSAgIG9iaiAgIEVudW1lcmFibGUgb2JqZWN0LlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICAgIGZuICAgIEV4ZWN1dGVkIGZvciBlYWNoIGl0ZW0uIFJldHVybiB0cnVlIGlmIHlvdXIgY29uZGl0aW9uIGlzIG1ldC5cbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydHMuc29tZSA9IGZ1bmN0aW9uIChvYmosIGZuKSB7XG4gIHZhciBpID0gMCxcbiAgICByZXN1bHQsXG4gICAgbDtcbiAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgIGwgPSBvYmoubGVuZ3RoO1xuXG4gICAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgICByZXN1bHQgPSBmbihvYmpbaV0sIGksIG9iaik7XG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBleHBvcnRzLmVhY2gob2JqLCBmdW5jdGlvbiAodmFsdWUsIGluZGV4KSB7XG4gICAgICByZXN1bHQgPSBmbih2YWx1ZSwgaW5kZXgsIG9iaik7XG4gICAgICByZXR1cm4gIShyZXN1bHQpO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiAhIXJlc3VsdDtcbn07XG5cbi8qKlxuICogUmV0dXJuIGEgbmV3IGVudW1lcmFibGUsIG1hcHBlZCBieSBhIGdpdmVuIGl0ZXJhdGlvbiBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge29iamVjdH0gICBvYmogRW51bWVyYWJsZSBvYmplY3QuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gIEV4ZWN1dGVkIGZvciBlYWNoIGl0ZW0uIFJldHVybiB0aGUgaXRlbSB0byByZXBsYWNlIHRoZSBvcmlnaW5hbCBpdGVtIHdpdGguXG4gKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgIE5ldyBtYXBwZWQgb2JqZWN0LlxuICovXG5leHBvcnRzLm1hcCA9IGZ1bmN0aW9uIChvYmosIGZuKSB7XG4gIHZhciBpID0gMCxcbiAgICByZXN1bHQgPSBbXSxcbiAgICBsO1xuXG4gIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICBsID0gb2JqLmxlbmd0aDtcbiAgICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICAgIHJlc3VsdFtpXSA9IGZuKG9ialtpXSwgaSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgcmVzdWx0W2ldID0gZm4ob2JqW2ldLCBpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQ29weSBhbGwgb2YgdGhlIHByb3BlcnRpZXMgaW4gdGhlIHNvdXJjZSBvYmplY3RzIG92ZXIgdG8gdGhlIGRlc3RpbmF0aW9uIG9iamVjdCwgYW5kIHJldHVybiB0aGUgZGVzdGluYXRpb24gb2JqZWN0LiBJdCdzIGluLW9yZGVyLCBzbyB0aGUgbGFzdCBzb3VyY2Ugd2lsbCBvdmVycmlkZSBwcm9wZXJ0aWVzIG9mIHRoZSBzYW1lIG5hbWUgaW4gcHJldmlvdXMgYXJndW1lbnRzLlxuICogQHBhcmFtIHsuLi5vYmplY3R9IGFyZ3VtZW50c1xuICogQHJldHVybiB7b2JqZWN0fVxuICovXG5leHBvcnRzLmV4dGVuZCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsXG4gICAgdGFyZ2V0ID0gYXJnc1swXSxcbiAgICBvYmpzID0gKGFyZ3MubGVuZ3RoID4gMSkgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmdzLCAxKSA6IFtdLFxuICAgIGkgPSAwLFxuICAgIGwgPSBvYmpzLmxlbmd0aCxcbiAgICBrZXksXG4gICAgb2JqO1xuXG4gIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgIG9iaiA9IG9ianNbaV0gfHwge307XG4gICAgZm9yIChrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgdGFyZ2V0W2tleV0gPSBvYmpba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldDtcbn07XG5cbi8qKlxuICogR2V0IGFsbCBvZiB0aGUga2V5cyBvbiBhbiBvYmplY3QuXG4gKiBAcGFyYW0gIHtvYmplY3R9IG9ialxuICogQHJldHVybiB7YXJyYXl9XG4gKi9cbmV4cG9ydHMua2V5cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgaWYgKCFvYmopIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAoT2JqZWN0LmtleXMpIHtcbiAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKTtcbiAgfVxuXG4gIHJldHVybiBleHBvcnRzLm1hcChvYmosIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgcmV0dXJuIGs7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBUaHJvdyBhbiBlcnJvciB3aXRoIHBvc3NpYmxlIGxpbmUgbnVtYmVyIGFuZCBzb3VyY2UgZmlsZS5cbiAqIEBwYXJhbSAge3N0cmluZ30gbWVzc2FnZSBFcnJvciBtZXNzYWdlXG4gKiBAcGFyYW0gIHtudW1iZXJ9IFtsaW5lXSAgTGluZSBudW1iZXIgaW4gdGVtcGxhdGUuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IFtmaWxlXSAgVGVtcGxhdGUgZmlsZSB0aGUgZXJyb3Igb2NjdXJlZCBpbi5cbiAqIEB0aHJvd3Mge0Vycm9yfSBObyBzZXJpb3VzbHksIHRoZSBwb2ludCBpcyB0byB0aHJvdyBhbiBlcnJvci5cbiAqL1xuZXhwb3J0cy50aHJvd0Vycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIGxpbmUsIGZpbGUpIHtcbiAgaWYgKGxpbmUpIHtcbiAgICBtZXNzYWdlICs9ICcgb24gbGluZSAnICsgbGluZTtcbiAgfVxuICBpZiAoZmlsZSkge1xuICAgIG1lc3NhZ2UgKz0gJyBpbiBmaWxlICcgKyBmaWxlO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcihtZXNzYWdlICsgJy4nKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3V0aWxzLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHNpdGUgPSB7XG4gIGluaXQgOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbiAgICB2YXIgbWljcm9BamF4ID0gcmVxdWlyZSgnLi9taWNyb2FqYXgnKTtcbiAgICB2YXIgcHVic3ViID0gcmVxdWlyZSgnLi9wdWJzdWInKTtcbiAgICB2YXIgc3dpZyAgPSByZXF1aXJlKCdzd2lnJyk7XG4gICAgdmFyIGFwcCA9IHtcbiAgICAgICdoZWxwJyA6IGhlbHBlcnMsXG4gICAgICAnYWpheCcgOiBtaWNyb0FqYXgsXG4gICAgICAncHVibGlzaCcgOiBwdWJzdWIucHVibGlzaCxcbiAgICAgICdzdWJzY3JpYmUnIDogcHVic3ViLnN1YnNjcmliZSxcbiAgICAgICd1bnN1YnNjcmliZScgOiBwdWJzdWIudW5zdWJzY3JpYmUsXG4gICAgICAncmVuZGVyJyA6IHN3aWcucnVuLFxuICAgICAgJ3ByZWNvbXBpbGUnIDogc3dpZy5wcmVjb21waWxlXG4gICAgfSxcbiAgICBkb20gPSB7XG4gICAgICAnb3ZlcmxheUNsb3NlJyA6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdmVybGF5LWNsb3NlJyksXG4gICAgICAnb3ZlcmxheUNvbnRlbnQnIDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXJsYXktY29udGVudCcpXG4gICAgfVxuICAgIHNpdGUuZXZlbnRzKGFwcCwgZG9tKTtcbiAgfSxcbiAgZXZlbnRzIDogZnVuY3Rpb24gKGFwcCwgZG9tKSB7XG5cbiAgICBhcHAuaGVscC5hZGRFdmVudExpc3RlbmVyQnlDbGFzcygnb3ZlcmxheS10cmlnZ2VyJywgJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgIGFwcC5oZWxwLmFkZEJvZHlDbGFzcygnb3ZlcmxheS12aXNpYmxlJyk7XG4gICAgICBhcHAuYWpheCh3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgJy9mcmFnbWVudHMvcmVnaXN0ZXInLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgIGFwcC5wdWJsaXNoKCcvdmlldy9yZWdpc3Rlci9zdWNjZXNzJywgdHJ1ZSk7XG4gICAgICAgIGRvbS5vdmVybGF5Q29udGVudC5pbm5lckhUTUwgPSByZXM7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGRvbS5vdmVybGF5Q2xvc2UuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbigpe1xuICAgICAgYXBwLmhlbHAucmVtb3ZlQm9keUNsYXNzKCdvdmVybGF5LXZpc2libGUnKTtcbiAgICAgIGFwcC5wdWJsaXNoKCcvdmlldy9vdmVybGF5L2Nsb3NlZCcsIHRydWUpO1xuICAgIH0pO1xuXG4gICAgYXBwLnN1YnNjcmliZShcIi92aWV3L3JlZ2lzdGVyL3N1Y2Nlc3NcIiwgZnVuY3Rpb24oZmxhZyl7XG4gICAgICAgIGlmKGZsYWcgPT09IHRydWUpe1xuICAgICAgICAgIHNpdGUucG9zdFNpZ251cChhcHApO1xuICAgICAgICAgIGFwcC5oZWxwLmFkZEV2ZW50TGlzdGVuZXJCeUNsYXNzKCdoZWxwJywgJ2NsaWNrJywgZnVuY3Rpb24oZSl7XG4gICAgICAgICAgICBhcHAuaGVscC5zaG93VG9vbHRpcChlLCAnaGVscC1tZXNzYWdlJyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGFwcC5zdWJzY3JpYmUoXCIvbWVzc2FnZS9lcnJvclwiLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3Itd3JhcFwiKS5pbm5lckhUTUwgKz0gZGF0YS5odG1sO1xuICAgIH0pXG4gIH0sXG4gIHBvc3RTaWdudXAgOiBmdW5jdGlvbihhcHApe1xuICAgIHZhciBzdWJtaXRhY2N0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NyZWF0ZS1hY2NvdW50LWJ1dHRvbicpXG4gICAgc3VibWl0YWNjdC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKGUpe1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdmFyIHNpZ251cEZvcm1FbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2lnbnVwXCIpO1xuICAgICAgdmFyIGZvcm1EYXRhID0gbmV3IEZvcm1EYXRhKHNpZ251cEZvcm1FbCk7XG4gICAgICBhcHAuaGVscC5wb3N0Rm9ybShzaWdudXBGb3JtRWwsIGZ1bmN0aW9uKHhocil7XG4gICAgICAgIGFwcC5oZWxwLnJlbW92ZUVsZW1lbnRzQnlDbGFzcygnZXJyb3InKTtcbiAgICAgICAgdmFyIHJlcyA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgaWYocmVzLmVycm9ycyl7XG4gICAgICAgICAgdmFyIHRwbCA9IGFwcC5wcmVjb21waWxlKCd7JSBmb3IgZXJyb3IgaW4gZXJyb3JzIHxyZXZlcnNlICV9PGRpdiBjbGFzcz1cImVycm9yXCI+e3sgZXJyb3IgfX08L2Rpdj57JSBlbmRmb3IgJX0nKS50cGxcbiAgICAgICAgICB2YXIgdGVtcGxhdGUgPSBhcHAucmVuZGVyKHRwbCwgeyAnZXJyb3JzJyA6IHJlcy5lcnJvcnMgfSk7XG4gICAgICAgICAgYXBwLnB1Ymxpc2goJy9tZXNzYWdlL2Vycm9yJywgeyBodG1sIDogdGVtcGxhdGUgfSlcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuc2l0ZS5pbml0KCk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZmFrZV84MjcxYmQ5My5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBoZWxwZXJzID0ge1xuICBhZGRFdmVudExpc3RlbmVyQnlDbGFzcyA6IGZ1bmN0aW9uIChjbGFzc05hbWUsIGV2ZW50LCBmbikge1xuICAgIHZhciBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShjbGFzc05hbWUpO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaXN0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBsaXN0W2ldLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGZuLCBmYWxzZSk7XG4gICAgfVxuICB9LFxuICBhZGRCb2R5Q2xhc3MgOiBmdW5jdGlvbiAoYykge1xuICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYm9keScpWzBdLmNsYXNzTmFtZSArPScgJytjO1xuICB9LFxuICByZW1vdmVCb2R5Q2xhc3MgOiBmdW5jdGlvbiAoYykge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NOYW1lID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXS5jbGFzc05hbWUucmVwbGFjZShjLFwiXCIpO1xuICB9LFxuICByZW1vdmVFbGVtZW50c0J5Q2xhc3MgOiBmdW5jdGlvbiAoY2xhc3NOYW1lKSB7XG4gICAgZWxlbWVudHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKGNsYXNzTmFtZSk7XG4gICAgd2hpbGUoZWxlbWVudHMubGVuZ3RoID4gMCl7XG4gICAgICAgIGVsZW1lbnRzWzBdLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbWVudHNbMF0pO1xuICAgIH1cbiAgfSxcbiAgcG9zdEZvcm0gOiBmdW5jdGlvbihvRm9ybUVsZW1lbnQsIGNiKXtcbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCl7IGNiKHhocikgfTtcbiAgICB4aHIub3BlbiAob0Zvcm1FbGVtZW50Lm1ldGhvZCwgb0Zvcm1FbGVtZW50LmFjdGlvbiwgdHJ1ZSk7XG4gICAgeGhyLnNlbmQgKG5ldyBGb3JtRGF0YSAob0Zvcm1FbGVtZW50KSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9LFxuICBzaG93VG9vbHRpcCA6IGZ1bmN0aW9uKGUsIHRvb2x0aXBDbGFzcykge1xuICAgIHZhciBtZXNzYWdlID0gZS50YXJnZXQucGFyZW50Tm9kZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKHRvb2x0aXBDbGFzcylbMF07XG4gICAgaWYobWVzc2FnZS5jbGFzc05hbWUuaW5kZXhPZihcImFjdGl2ZVwiKSA+IC0xKXtcbiAgICAgIG1lc3NhZ2UuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1lc3NhZ2UuY2xhc3NOYW1lICs9ICcgYWN0aXZlJztcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBoZWxwZXJzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2hlbHBlcnMuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKlxuQ29weXJpZ2h0IChjKSAyMDA4IFN0ZWZhbiBMYW5nZS1IZWdlcm1hbm5cblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG5mdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLlxuKi9cblxuZnVuY3Rpb24gbWljcm9BamF4KHVybCwgY2FsbGJhY2tGdW5jdGlvbilcbntcblx0dGhpcy5iaW5kRnVuY3Rpb24gPSBmdW5jdGlvbiAoY2FsbGVyLCBvYmplY3QpIHtcblx0XHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGVyLmFwcGx5KG9iamVjdCwgW29iamVjdF0pO1xuXHRcdH07XG5cdH07XG5cblx0dGhpcy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uIChvYmplY3QpIHtcblx0XHRpZiAodGhpcy5yZXF1ZXN0LnJlYWR5U3RhdGU9PTQpXG5cdFx0XHR0aGlzLmNhbGxiYWNrRnVuY3Rpb24odGhpcy5yZXF1ZXN0LnJlc3BvbnNlVGV4dCk7XG5cdH07XG5cblx0dGhpcy5nZXRSZXF1ZXN0ID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHdpbmRvdy5BY3RpdmVYT2JqZWN0KVxuXHRcdFx0cmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNaWNyb3NvZnQuWE1MSFRUUCcpO1xuXHRcdGVsc2UgaWYgKHdpbmRvdy5YTUxIdHRwUmVxdWVzdClcblx0XHRcdHJldHVybiBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH07XG5cblx0dGhpcy5wb3N0Qm9keSA9IChhcmd1bWVudHNbMl0gfHwgXCJcIik7XG5cblx0dGhpcy5jYWxsYmFja0Z1bmN0aW9uPWNhbGxiYWNrRnVuY3Rpb247XG5cdHRoaXMudXJsPXVybDtcblx0dGhpcy5yZXF1ZXN0ID0gdGhpcy5nZXRSZXF1ZXN0KCk7XG5cblx0aWYodGhpcy5yZXF1ZXN0KSB7XG5cdFx0dmFyIHJlcSA9IHRoaXMucmVxdWVzdDtcblx0XHRyZXEub25yZWFkeXN0YXRlY2hhbmdlID0gdGhpcy5iaW5kRnVuY3Rpb24odGhpcy5zdGF0ZUNoYW5nZSwgdGhpcyk7XG5cblx0XHRpZiAodGhpcy5wb3N0Qm9keSE9PVwiXCIpIHtcblx0XHRcdHJlcS5vcGVuKFwiUE9TVFwiLCB1cmwsIHRydWUpO1xuXHRcdFx0cmVxLnNldFJlcXVlc3RIZWFkZXIoJ1gtUmVxdWVzdGVkLVdpdGgnLCAnWE1MSHR0cFJlcXVlc3QnKTtcblx0XHRcdHJlcS5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LXR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG5cdFx0XHRyZXEuc2V0UmVxdWVzdEhlYWRlcignQ29ubmVjdGlvbicsICdjbG9zZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXEub3BlbihcIkdFVFwiLCB1cmwsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJlcS5zZW5kKHRoaXMucG9zdEJvZHkpO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbWljcm9BamF4O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL21pY3JvYWpheC5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogcHVic3ViLmpzXG4gKlxuICogQSB0aW55LCBvcHRpbWl6ZWQsIHRlc3RlZCwgc3RhbmRhbG9uZSBhbmQgcm9idXN0XG4gKiBwdWJzdWIgaW1wbGVtZW50YXRpb24gc3VwcG9ydGluZyBkaWZmZXJlbnQgamF2YXNjcmlwdCBlbnZpcm9ubWVudHNcbiAqXG4gKiBAYXV0aG9yIEZlZGVyaWNvIFwiTG94XCIgTHVjaWduYW5vIDxodHRwOi8vcGx1cy5seS9mZWRlcmljby5sb3g+XG4gKlxuICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vZmVkZXJpY28tbG94L3B1YnN1Yi5qc1xuICovXG5cbi8qZ2xvYmFsIGRlZmluZSwgbW9kdWxlKi9cbihmdW5jdGlvbiAoY29udGV4dCkge1xuXHQndXNlIHN0cmljdCc7XG5cblx0LyoqXG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBpbml0KCkge1xuXHRcdC8vdGhlIGNoYW5uZWwgc3Vic2NyaXB0aW9uIGhhc2hcblx0XHR2YXIgY2hhbm5lbHMgPSB7fSxcblx0XHRcdC8vaGVscCBtaW5pZmljYXRpb25cblx0XHRcdGZ1bmNUeXBlID0gRnVuY3Rpb247XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Lypcblx0XHRcdCAqIEBwdWJsaWNcblx0XHRcdCAqXG5cdFx0XHQgKiBQdWJsaXNoIHNvbWUgZGF0YSBvbiBhIGNoYW5uZWxcblx0XHRcdCAqXG5cdFx0XHQgKiBAcGFyYW0gU3RyaW5nIGNoYW5uZWwgVGhlIGNoYW5uZWwgdG8gcHVibGlzaCBvblxuXHRcdFx0ICogQHBhcmFtIE1peGVkIGFyZ3VtZW50IFRoZSBkYXRhIHRvIHB1Ymxpc2gsIHRoZSBmdW5jdGlvbiBzdXBwb3J0c1xuXHRcdFx0ICogYXMgbWFueSBkYXRhIHBhcmFtZXRlcnMgYXMgbmVlZGVkXG5cdFx0XHQgKlxuXHRcdFx0ICogQGV4YW1wbGUgUHVibGlzaCBzdHVmZiBvbiAnL3NvbWUvY2hhbm5lbCcuXG5cdFx0XHQgKiBBbnl0aGluZyBzdWJzY3JpYmVkIHdpbGwgYmUgY2FsbGVkIHdpdGggYSBmdW5jdGlvblxuXHRcdFx0ICogc2lnbmF0dXJlIGxpa2U6IGZ1bmN0aW9uKGEsYixjKXsgLi4uIH1cblx0XHRcdCAqXG5cdFx0XHQgKiBQdWJTdWIucHVibGlzaChcblx0XHRcdCAqXHRcdFwiL3NvbWUvY2hhbm5lbFwiLCBcImFcIiwgXCJiXCIsXG5cdFx0XHQgKlx0XHR7dG90YWw6IDEwLCBtaW46IDEsIG1heDogM31cblx0XHRcdCAqICk7XG5cdFx0XHQgKi9cblx0XHRcdHB1Ymxpc2g6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Ly9oZWxwIG1pbmlmaWNhdGlvblxuXHRcdFx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cyxcblx0XHRcdFx0XHQvLyBhcmdzWzBdIGlzIHRoZSBjaGFubmVsXG5cdFx0XHRcdFx0c3VicyA9IGNoYW5uZWxzW2FyZ3NbMF1dLFxuXHRcdFx0XHRcdGxlbixcblx0XHRcdFx0XHRwYXJhbXMsXG5cdFx0XHRcdFx0eDtcblxuXHRcdFx0XHRpZiAoc3Vicykge1xuXHRcdFx0XHRcdGxlbiA9IHN1YnMubGVuZ3RoO1xuXHRcdFx0XHRcdHBhcmFtcyA9IChhcmdzLmxlbmd0aCA+IDEpID9cblx0XHRcdFx0XHRcdFx0QXJyYXkucHJvdG90eXBlLnNwbGljZS5jYWxsKGFyZ3MsIDEpIDogW107XG5cblx0XHRcdFx0XHQvL3J1biB0aGUgY2FsbGJhY2tzIGFzeW5jaHJvbm91c2x5LFxuXHRcdFx0XHRcdC8vZG8gbm90IGJsb2NrIHRoZSBtYWluIGV4ZWN1dGlvbiBwcm9jZXNzXG5cdFx0XHRcdFx0c2V0VGltZW91dChcblx0XHRcdFx0XHRcdGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRcdFx0Ly9leGVjdXRlcyBjYWxsYmFja3MgaW4gdGhlIG9yZGVyXG5cdFx0XHRcdFx0XHRcdC8vaW4gd2hpY2ggdGhleSB3ZXJlIHJlZ2lzdGVyZWRcblx0XHRcdFx0XHRcdFx0Zm9yICh4ID0gMDsgeCA8IGxlbjsgeCArPSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3Vic1t4XS5hcHBseShjb250ZXh0LCBwYXJhbXMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly9jbGVhciByZWZlcmVuY2VzIHRvIGFsbG93IGdhcmJhZ2UgY29sbGVjdGlvblxuXHRcdFx0XHRcdFx0XHRzdWJzID0gY29udGV4dCA9IHBhcmFtcyA9IG51bGw7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0MFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdC8qXG5cdFx0XHQgKiBAcHVibGljXG5cdFx0XHQgKlxuXHRcdFx0ICogUmVnaXN0ZXIgYSBjYWxsYmFjayBvbiBhIGNoYW5uZWxcblx0XHRcdCAqXG5cdFx0XHQgKiBAcGFyYW0gU3RyaW5nIGNoYW5uZWwgVGhlIGNoYW5uZWwgdG8gc3Vic2NyaWJlIHRvXG5cdFx0XHQgKiBAcGFyYW0gRnVuY3Rpb24gY2FsbGJhY2sgVGhlIGV2ZW50IGhhbmRsZXIsIGFueSB0aW1lIHNvbWV0aGluZyBpc1xuXHRcdFx0ICogcHVibGlzaGVkIG9uIGEgc3Vic2NyaWJlZCBjaGFubmVsLCB0aGUgY2FsbGJhY2sgd2lsbCBiZSBjYWxsZWRcblx0XHRcdCAqIHdpdGggdGhlIHB1Ymxpc2hlZCBhcnJheSBhcyBvcmRlcmVkIGFyZ3VtZW50c1xuXHRcdFx0ICpcblx0XHRcdCAqIEByZXR1cm4gQXJyYXkgQSBoYW5kbGUgd2hpY2ggY2FuIGJlIHVzZWQgdG8gdW5zdWJzY3JpYmUgdGhpc1xuXHRcdFx0ICogcGFydGljdWxhciBzdWJzY3JpcHRpb25cblx0XHRcdCAqXG5cdFx0XHQgKiBAZXhhbXBsZSBQdWJTdWIuc3Vic2NyaWJlKFxuXHRcdFx0ICpcdFx0XHRcdFwiL3NvbWUvY2hhbm5lbFwiLFxuXHRcdFx0ICpcdFx0XHRcdGZ1bmN0aW9uKGEsIGIsIGMpeyAuLi4gfVxuXHRcdFx0ICpcdFx0XHQpO1xuXHRcdFx0ICovXG5cdFx0XHRzdWJzY3JpYmU6IGZ1bmN0aW9uIChjaGFubmVsLCBjYWxsYmFjaykge1xuXHRcdFx0XHRpZiAodHlwZW9mIGNoYW5uZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIG9yIG1pc3NpbmcgY2hhbm5lbFwiO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCEoY2FsbGJhY2sgaW5zdGFuY2VvZiBmdW5jVHlwZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBcImludmFsaWQgb3IgbWlzc2luZyBjYWxsYmFja1wiO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFjaGFubmVsc1tjaGFubmVsXSkge1xuXHRcdFx0XHRcdGNoYW5uZWxzW2NoYW5uZWxdID0gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFubmVsc1tjaGFubmVsXS5wdXNoKGNhbGxiYWNrKTtcblxuXHRcdFx0XHRyZXR1cm4ge2NoYW5uZWw6IGNoYW5uZWwsIGNhbGxiYWNrOiBjYWxsYmFja307XG5cdFx0XHR9LFxuXG5cdFx0XHQvKlxuXHRcdFx0ICogQHB1YmxpY1xuXHRcdFx0ICpcblx0XHRcdCAqIERpc2Nvbm5lY3QgYSBzdWJzY3JpYmVkIGZ1bmN0aW9uIGYuXG5cdFx0XHQgKlxuXHRcdFx0ICogQHBhcmFtIE1peGVkIGhhbmRsZSBUaGUgcmV0dXJuIHZhbHVlIGZyb20gYSBzdWJzY3JpYmUgY2FsbCBvciB0aGVcblx0XHRcdCAqIG5hbWUgb2YgYSBjaGFubmVsIGFzIGEgU3RyaW5nXG5cdFx0XHQgKiBAcGFyYW0gRnVuY3Rpb24gY2FsbGJhY2sgW09QVElPTkFMXSBUaGUgZXZlbnQgaGFuZGxlciBvcmlnaW5hYWxseVxuXHRcdFx0ICogcmVnaXN0ZXJlZCwgbm90IG5lZWRlZCBpZiBoYW5kbGUgY29udGFpbnMgdGhlIHJldHVybiB2YWx1ZVxuXHRcdFx0ICogb2Ygc3Vic2NyaWJlXG5cdFx0XHQgKlxuXHRcdFx0ICogQGV4YW1wbGVcblx0XHRcdCAqIHZhciBoYW5kbGUgPSBQdWJTdWIuc3Vic2NyaWJlKFwiL3NvbWUvY2hhbm5lbFwiLCBmdW5jdGlvbigpe30pO1xuXHRcdFx0ICogUHViU3ViLnVuc3Vic2NyaWJlKGhhbmRsZSk7XG5cdFx0XHQgKlxuXHRcdFx0ICogb3Jcblx0XHRcdCAqXG5cdFx0XHQgKiBQdWJTdWIudW5zdWJzY3JpYmUoXCIvc29tZS9jaGFubmVsXCIsIGNhbGxiYWNrKTtcblx0XHRcdCAqL1xuXHRcdFx0dW5zdWJzY3JpYmU6IGZ1bmN0aW9uIChoYW5kbGUsIGNhbGxiYWNrKSB7XG5cdFx0XHRcdGlmIChoYW5kbGUuY2hhbm5lbCAmJiBoYW5kbGUuY2FsbGJhY2spIHtcblx0XHRcdFx0XHRjYWxsYmFjayA9IGhhbmRsZS5jYWxsYmFjaztcblx0XHRcdFx0XHRoYW5kbGUgPSBoYW5kbGUuY2hhbm5lbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgaGFuZGxlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IFwiaW52YWxpZCBvciBtaXNzaW5nIGNoYW5uZWxcIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghKGNhbGxiYWNrIGluc3RhbmNlb2YgZnVuY1R5cGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIG9yIG1pc3NpbmcgY2FsbGJhY2tcIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZhciBzdWJzID0gY2hhbm5lbHNbaGFuZGxlXSxcblx0XHRcdFx0XHR4LFxuXHRcdFx0XHRcdHkgPSAoc3VicyBpbnN0YW5jZW9mIEFycmF5KSA/IHN1YnMubGVuZ3RoIDogMDtcblxuXHRcdFx0XHRmb3IgKHggPSAwOyB4IDwgeTsgeCArPSAxKSB7XG5cdFx0XHRcdFx0aWYgKHN1YnNbeF0gPT09IGNhbGxiYWNrKSB7XG5cdFx0XHRcdFx0XHRzdWJzLnNwbGljZSh4LCAxKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvL1VNRFxuXHRpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG5cdFx0Ly9BTUQgbW9kdWxlXG5cdFx0ZGVmaW5lKCdwdWJzdWInLCBpbml0KTtcblx0fSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuXHRcdC8vQ29tbW9uSlMgbW9kdWxlXG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBpbml0KCk7XG5cdH0gZWxzZSB7XG5cdFx0Ly90cmFkaXRpb25hbCBuYW1lc3BhY2Vcblx0XHRjb250ZXh0LlB1YlN1YiA9IGluaXQoKTtcblx0fVxufSh0aGlzKSk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvcHVic3ViLmpzXCIsXCIvXCIpIl19
