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
window.onload = function(){
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
        app.publish('/event/register/submit', true);
        app.ajax(window.location.origin + '/fragments/register', function (res) {
          app.publish('/view/register/success', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.help.addEventListenerByClass('signin-btn', 'click', function(e){
        e.preventDefault();
        app.help.addBodyClass('overlay-visible');
        app.ajax(window.location.origin + '/fragments/signin', function (res) {
          app.publish('/view/signin/success', true);
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

      app.subscribe("/form/register/update", function(flag){
          var button = document.getElementById('create-account-button');
          app.help.loading(button, 'remove');
      });

      app.subscribe("/event/register/submit", function(){
        app.help.addBodyClass('overlay-visible');
      });

      app.subscribe("/message/error", function(data){
        document.getElementById("error-wrap").innerHTML += data.html;
      })
    },
    postSignup : function(app){
      var submitacct = document.getElementById('create-account-button');
      submitacct.addEventListener('click', function(e){
        e.preventDefault();
        app.help.loading(submitacct);
        var signupFormEl = document.getElementById("signup");
        var formData = new FormData(signupFormEl);
        app.help.postForm(signupFormEl, function(xhr){
          app.help.removeElementsByClass('error');

          var res = JSON.parse(xhr.response);
          if(res.errors){
            app.publish('/form/register/update', 'fail');
            var tpl = app.precompile('{% for error in errors |reverse %}<div class="error">{{ error }}</div>{% endfor %}').tpl
            var template = app.render(tpl, { 'errors' : res.errors });
            app.publish('/message/error', { html : template })
          } else {
            app.publish('/form/register/update', 'success');
          }
        });
      });
    }
  }

  site.init();
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_444a947c.js","/")
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
  },
  loading : function(target, type){
    if (!target) return;
    var spinner = target.parentNode;
    if(spinner.className.indexOf("active") == -1){
      spinner.className += ' active';
    }
    if(type === 'remove'){
      window.setTimeout(function() {
        spinner.classList.remove('active');
      }, 1000);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvZGF0ZWZvcm1hdHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2ZpbHRlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sZXhlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvZmlsZXN5c3RlbS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL21lbW9yeS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3BhcnNlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3N3aWcuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2F1dG9lc2NhcGUuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Jsb2NrLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlaWYuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2V4dGVuZHMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2ZpbHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZm9yLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pZi5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW1wb3J0LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmNsdWRlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvbWFjcm8uanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3BhcmVudC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvcmF3LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9zZXQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3NwYWNlbGVzcy5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3V0aWxzLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9zcmMvanMvZmFrZV80NDRhOTQ3Yy5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvc3JjL2pzL2hlbHBlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9taWNyb2FqYXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9wdWJzdWIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDam5CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzF1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaHRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLG51bGwsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgQnVmZmVyLl91c2VUeXBlZEFycmF5c2A6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG5CdWZmZXIuX3VzZVR5cGVkQXJyYXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKywgRmlyZWZveCA0KyxcbiAgLy8gQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLiBJZiB0aGUgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGFkZGluZ1xuICAvLyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0XG4gIC8vIGJlY2F1c2Ugd2UgbmVlZCB0byBiZSBhYmxlIHRvIGFkZCBhbGwgdGhlIG5vZGUgQnVmZmVyIEFQSSBtZXRob2RzLiBUaGlzIGlzIGFuIGlzc3VlXG4gIC8vIGluIEZpcmVmb3ggNC0yOS4gTm93IGZpeGVkOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gYXNzdW1lIHRoYXQgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwIHx8ICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0X3N0YXJ0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2krMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiB1dGYxNmxlVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaGkgPSBjID4+IDhcbiAgICBsbyA9IGMgJSAyNTZcbiAgICBieXRlQXJyYXkucHVzaChsbylcbiAgICBieXRlQXJyYXkucHVzaChoaSlcbiAgfVxuXG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCwgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBaRVJPICAgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdG1vZHVsZS5leHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0bW9kdWxlLmV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0oKSlcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0XCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHJlc29sdmVzIC4gYW5kIC4uIGVsZW1lbnRzIGluIGEgcGF0aCBhcnJheSB3aXRoIGRpcmVjdG9yeSBuYW1lcyB0aGVyZVxuLy8gbXVzdCBiZSBubyBzbGFzaGVzLCBlbXB0eSBlbGVtZW50cywgb3IgZGV2aWNlIG5hbWVzIChjOlxcKSBpbiB0aGUgYXJyYXlcbi8vIChzbyBhbHNvIG5vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgLSBpdCBkb2VzIG5vdCBkaXN0aW5ndWlzaFxuLy8gcmVsYXRpdmUgYW5kIGFic29sdXRlIHBhdGhzKVxuZnVuY3Rpb24gbm9ybWFsaXplQXJyYXkocGFydHMsIGFsbG93QWJvdmVSb290KSB7XG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBwYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIHZhciBsYXN0ID0gcGFydHNbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKGFsbG93QWJvdmVSb290KSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBwYXJ0cy51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYXJ0cztcbn1cblxuLy8gU3BsaXQgYSBmaWxlbmFtZSBpbnRvIFtyb290LCBkaXIsIGJhc2VuYW1lLCBleHRdLCB1bml4IHZlcnNpb25cbi8vICdyb290JyBpcyBqdXN0IGEgc2xhc2gsIG9yIG5vdGhpbmcuXG52YXIgc3BsaXRQYXRoUmUgPVxuICAgIC9eKFxcLz98KShbXFxzXFxTXSo/KSgoPzpcXC57MSwyfXxbXlxcL10rP3wpKFxcLlteLlxcL10qfCkpKD86W1xcL10qKSQvO1xudmFyIHNwbGl0UGF0aCA9IGZ1bmN0aW9uKGZpbGVuYW1lKSB7XG4gIHJldHVybiBzcGxpdFBhdGhSZS5leGVjKGZpbGVuYW1lKS5zbGljZSgxKTtcbn07XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIHJlc3VsdCA9IHNwbGl0UGF0aChwYXRoKSxcbiAgICAgIHJvb3QgPSByZXN1bHRbMF0sXG4gICAgICBkaXIgPSByZXN1bHRbMV07XG5cbiAgaWYgKCFyb290ICYmICFkaXIpIHtcbiAgICAvLyBObyBkaXJuYW1lIHdoYXRzb2V2ZXJcbiAgICByZXR1cm4gJy4nO1xuICB9XG5cbiAgaWYgKGRpcikge1xuICAgIC8vIEl0IGhhcyBhIGRpcm5hbWUsIHN0cmlwIHRyYWlsaW5nIHNsYXNoXG4gICAgZGlyID0gZGlyLnN1YnN0cigwLCBkaXIubGVuZ3RoIC0gMSk7XG4gIH1cblxuICByZXR1cm4gcm9vdCArIGRpcjtcbn07XG5cblxuZXhwb3J0cy5iYXNlbmFtZSA9IGZ1bmN0aW9uKHBhdGgsIGV4dCkge1xuICB2YXIgZiA9IHNwbGl0UGF0aChwYXRoKVsyXTtcbiAgLy8gVE9ETzogbWFrZSB0aGlzIGNvbXBhcmlzb24gY2FzZS1pbnNlbnNpdGl2ZSBvbiB3aW5kb3dzP1xuICBpZiAoZXh0ICYmIGYuc3Vic3RyKC0xICogZXh0Lmxlbmd0aCkgPT09IGV4dCkge1xuICAgIGYgPSBmLnN1YnN0cigwLCBmLmxlbmd0aCAtIGV4dC5sZW5ndGgpO1xuICB9XG4gIHJldHVybiBmO1xufTtcblxuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBzcGxpdFBhdGgocGF0aClbM107XG59O1xuXG5mdW5jdGlvbiBmaWx0ZXIgKHhzLCBmKSB7XG4gICAgaWYgKHhzLmZpbHRlcikgcmV0dXJuIHhzLmZpbHRlcihmKTtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZih4c1tpXSwgaSwgeHMpKSByZXMucHVzaCh4c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbi8vIFN0cmluZy5wcm90b3R5cGUuc3Vic3RyIC0gbmVnYXRpdmUgaW5kZXggZG9uJ3Qgd29yayBpbiBJRThcbnZhciBzdWJzdHIgPSAnYWInLnN1YnN0cigtMSkgPT09ICdiJ1xuICAgID8gZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikgeyByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKSB9XG4gICAgOiBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7XG4gICAgICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gc3RyLmxlbmd0aCArIHN0YXJ0O1xuICAgICAgICByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKTtcbiAgICB9XG47XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5XCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvc3dpZycpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWdcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbnZhciBfbW9udGhzID0ge1xuICAgIGZ1bGw6IFsnSmFudWFyeScsICdGZWJydWFyeScsICdNYXJjaCcsICdBcHJpbCcsICdNYXknLCAnSnVuZScsICdKdWx5JywgJ0F1Z3VzdCcsICdTZXB0ZW1iZXInLCAnT2N0b2JlcicsICdOb3ZlbWJlcicsICdEZWNlbWJlciddLFxuICAgIGFiYnI6IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLCAnT2N0JywgJ05vdicsICdEZWMnXVxuICB9LFxuICBfZGF5cyA9IHtcbiAgICBmdWxsOiBbJ1N1bmRheScsICdNb25kYXknLCAnVHVlc2RheScsICdXZWRuZXNkYXknLCAnVGh1cnNkYXknLCAnRnJpZGF5JywgJ1NhdHVyZGF5J10sXG4gICAgYWJicjogWydTdW4nLCAnTW9uJywgJ1R1ZScsICdXZWQnLCAnVGh1JywgJ0ZyaScsICdTYXQnXSxcbiAgICBhbHQ6IHsnLTEnOiAnWWVzdGVyZGF5JywgMDogJ1RvZGF5JywgMTogJ1RvbW9ycm93J31cbiAgfTtcblxuLypcbkRhdGVaIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZTpcbkNvcHlyaWdodCAoYykgMjAxMSBUb21vIFVuaXZlcnNhbGlzIChodHRwOi8vdG9tb3VuaXZlcnNhbGlzLmNvbSlcblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuKi9cbmV4cG9ydHMudHpPZmZzZXQgPSAwO1xuZXhwb3J0cy5EYXRlWiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1lbWJlcnMgPSB7XG4gICAgICAnZGVmYXVsdCc6IFsnZ2V0VVRDRGF0ZScsICdnZXRVVENEYXknLCAnZ2V0VVRDRnVsbFllYXInLCAnZ2V0VVRDSG91cnMnLCAnZ2V0VVRDTWlsbGlzZWNvbmRzJywgJ2dldFVUQ01pbnV0ZXMnLCAnZ2V0VVRDTW9udGgnLCAnZ2V0VVRDU2Vjb25kcycsICd0b0lTT1N0cmluZycsICd0b0dNVFN0cmluZycsICd0b1VUQ1N0cmluZycsICd2YWx1ZU9mJywgJ2dldFRpbWUnXSxcbiAgICAgIHo6IFsnZ2V0RGF0ZScsICdnZXREYXknLCAnZ2V0RnVsbFllYXInLCAnZ2V0SG91cnMnLCAnZ2V0TWlsbGlzZWNvbmRzJywgJ2dldE1pbnV0ZXMnLCAnZ2V0TW9udGgnLCAnZ2V0U2Vjb25kcycsICdnZXRZZWFyJywgJ3RvRGF0ZVN0cmluZycsICd0b0xvY2FsZURhdGVTdHJpbmcnLCAndG9Mb2NhbGVUaW1lU3RyaW5nJ11cbiAgICB9LFxuICAgIGQgPSB0aGlzO1xuXG4gIGQuZGF0ZSA9IGQuZGF0ZVogPSAoYXJndW1lbnRzLmxlbmd0aCA+IDEpID8gbmV3IERhdGUoRGF0ZS5VVEMuYXBwbHkoRGF0ZSwgYXJndW1lbnRzKSArICgobmV3IERhdGUoKSkuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwKSkgOiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkgPyBuZXcgRGF0ZShuZXcgRGF0ZShhcmd1bWVudHNbJzAnXSkpIDogbmV3IERhdGUoKTtcblxuICBkLnRpbWV6b25lT2Zmc2V0ID0gZC5kYXRlWi5nZXRUaW1lem9uZU9mZnNldCgpO1xuXG4gIHV0aWxzLmVhY2gobWVtYmVycy56LCBmdW5jdGlvbiAobmFtZSkge1xuICAgIGRbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZC5kYXRlWltuYW1lXSgpO1xuICAgIH07XG4gIH0pO1xuICB1dGlscy5lYWNoKG1lbWJlcnNbJ2RlZmF1bHQnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICBkW25hbWVdID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGQuZGF0ZVtuYW1lXSgpO1xuICAgIH07XG4gIH0pO1xuXG4gIHRoaXMuc2V0VGltZXpvbmVPZmZzZXQoZXhwb3J0cy50ek9mZnNldCk7XG59O1xuZXhwb3J0cy5EYXRlWi5wcm90b3R5cGUgPSB7XG4gIGdldFRpbWV6b25lT2Zmc2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudGltZXpvbmVPZmZzZXQ7XG4gIH0sXG4gIHNldFRpbWV6b25lT2Zmc2V0OiBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gICAgdGhpcy50aW1lem9uZU9mZnNldCA9IG9mZnNldDtcbiAgICB0aGlzLmRhdGVaID0gbmV3IERhdGUodGhpcy5kYXRlLmdldFRpbWUoKSArIHRoaXMuZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpICogNjAwMDAgLSB0aGlzLnRpbWV6b25lT2Zmc2V0ICogNjAwMDApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG59O1xuXG4vLyBEYXlcbmV4cG9ydHMuZCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gKGlucHV0LmdldERhdGUoKSA8IDEwID8gJzAnIDogJycpICsgaW5wdXQuZ2V0RGF0ZSgpO1xufTtcbmV4cG9ydHMuRCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gX2RheXMuYWJicltpbnB1dC5nZXREYXkoKV07XG59O1xuZXhwb3J0cy5qID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXREYXRlKCk7XG59O1xuZXhwb3J0cy5sID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBfZGF5cy5mdWxsW2lucHV0LmdldERheSgpXTtcbn07XG5leHBvcnRzLk4gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGQgPSBpbnB1dC5nZXREYXkoKTtcbiAgcmV0dXJuIChkID49IDEpID8gZCA6IDc7XG59O1xuZXhwb3J0cy5TID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBkID0gaW5wdXQuZ2V0RGF0ZSgpO1xuICByZXR1cm4gKGQgJSAxMCA9PT0gMSAmJiBkICE9PSAxMSA/ICdzdCcgOiAoZCAlIDEwID09PSAyICYmIGQgIT09IDEyID8gJ25kJyA6IChkICUgMTAgPT09IDMgJiYgZCAhPT0gMTMgPyAncmQnIDogJ3RoJykpKTtcbn07XG5leHBvcnRzLncgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldERheSgpO1xufTtcbmV4cG9ydHMueiA9IGZ1bmN0aW9uIChpbnB1dCwgb2Zmc2V0LCBhYmJyKSB7XG4gIHZhciB5ZWFyID0gaW5wdXQuZ2V0RnVsbFllYXIoKSxcbiAgICBlID0gbmV3IGV4cG9ydHMuRGF0ZVooeWVhciwgaW5wdXQuZ2V0TW9udGgoKSwgaW5wdXQuZ2V0RGF0ZSgpLCAxMiwgMCwgMCksXG4gICAgZCA9IG5ldyBleHBvcnRzLkRhdGVaKHllYXIsIDAsIDEsIDEyLCAwLCAwKTtcblxuICBlLnNldFRpbWV6b25lT2Zmc2V0KG9mZnNldCwgYWJicik7XG4gIGQuc2V0VGltZXpvbmVPZmZzZXQob2Zmc2V0LCBhYmJyKTtcbiAgcmV0dXJuIE1hdGgucm91bmQoKGUgLSBkKSAvIDg2NDAwMDAwKTtcbn07XG5cbi8vIFdlZWtcbmV4cG9ydHMuVyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgdGFyZ2V0ID0gbmV3IERhdGUoaW5wdXQudmFsdWVPZigpKSxcbiAgICBkYXlOciA9IChpbnB1dC5nZXREYXkoKSArIDYpICUgNyxcbiAgICBmVGh1cnM7XG5cbiAgdGFyZ2V0LnNldERhdGUodGFyZ2V0LmdldERhdGUoKSAtIGRheU5yICsgMyk7XG4gIGZUaHVycyA9IHRhcmdldC52YWx1ZU9mKCk7XG4gIHRhcmdldC5zZXRNb250aCgwLCAxKTtcbiAgaWYgKHRhcmdldC5nZXREYXkoKSAhPT0gNCkge1xuICAgIHRhcmdldC5zZXRNb250aCgwLCAxICsgKCg0IC0gdGFyZ2V0LmdldERheSgpKSArIDcpICUgNyk7XG4gIH1cblxuICByZXR1cm4gMSArIE1hdGguY2VpbCgoZlRodXJzIC0gdGFyZ2V0KSAvIDYwNDgwMDAwMCk7XG59O1xuXG4vLyBNb250aFxuZXhwb3J0cy5GID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBfbW9udGhzLmZ1bGxbaW5wdXQuZ2V0TW9udGgoKV07XG59O1xuZXhwb3J0cy5tID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiAoaW5wdXQuZ2V0TW9udGgoKSA8IDkgPyAnMCcgOiAnJykgKyAoaW5wdXQuZ2V0TW9udGgoKSArIDEpO1xufTtcbmV4cG9ydHMuTSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gX21vbnRocy5hYmJyW2lucHV0LmdldE1vbnRoKCldO1xufTtcbmV4cG9ydHMubiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0TW9udGgoKSArIDE7XG59O1xuZXhwb3J0cy50ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiAzMiAtIChuZXcgRGF0ZShpbnB1dC5nZXRGdWxsWWVhcigpLCBpbnB1dC5nZXRNb250aCgpLCAzMikuZ2V0RGF0ZSgpKTtcbn07XG5cbi8vIFllYXJcbmV4cG9ydHMuTCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gbmV3IERhdGUoaW5wdXQuZ2V0RnVsbFllYXIoKSwgMSwgMjkpLmdldERhdGUoKSA9PT0gMjk7XG59O1xuZXhwb3J0cy5vID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciB0YXJnZXQgPSBuZXcgRGF0ZShpbnB1dC52YWx1ZU9mKCkpO1xuICB0YXJnZXQuc2V0RGF0ZSh0YXJnZXQuZ2V0RGF0ZSgpIC0gKChpbnB1dC5nZXREYXkoKSArIDYpICUgNykgKyAzKTtcbiAgcmV0dXJuIHRhcmdldC5nZXRGdWxsWWVhcigpO1xufTtcbmV4cG9ydHMuWSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0RnVsbFllYXIoKTtcbn07XG5leHBvcnRzLnkgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIChpbnB1dC5nZXRGdWxsWWVhcigpLnRvU3RyaW5nKCkpLnN1YnN0cigyKTtcbn07XG5cbi8vIFRpbWVcbmV4cG9ydHMuYSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0SG91cnMoKSA8IDEyID8gJ2FtJyA6ICdwbSc7XG59O1xuZXhwb3J0cy5BID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRIb3VycygpIDwgMTIgPyAnQU0nIDogJ1BNJztcbn07XG5leHBvcnRzLkIgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGhvdXJzID0gaW5wdXQuZ2V0VVRDSG91cnMoKSwgYmVhdHM7XG4gIGhvdXJzID0gKGhvdXJzID09PSAyMykgPyAwIDogaG91cnMgKyAxO1xuICBiZWF0cyA9IE1hdGguYWJzKCgoKChob3VycyAqIDYwKSArIGlucHV0LmdldFVUQ01pbnV0ZXMoKSkgKiA2MCkgKyBpbnB1dC5nZXRVVENTZWNvbmRzKCkpIC8gODYuNCkudG9GaXhlZCgwKTtcbiAgcmV0dXJuICgnMDAwJy5jb25jYXQoYmVhdHMpLnNsaWNlKGJlYXRzLmxlbmd0aCkpO1xufTtcbmV4cG9ydHMuZyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgaCA9IGlucHV0LmdldEhvdXJzKCk7XG4gIHJldHVybiBoID09PSAwID8gMTIgOiAoaCA+IDEyID8gaCAtIDEyIDogaCk7XG59O1xuZXhwb3J0cy5HID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRIb3VycygpO1xufTtcbmV4cG9ydHMuaCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgaCA9IGlucHV0LmdldEhvdXJzKCk7XG4gIHJldHVybiAoKGggPCAxMCB8fCAoMTIgPCBoICYmIDIyID4gaCkpID8gJzAnIDogJycpICsgKChoIDwgMTIpID8gaCA6IGggLSAxMik7XG59O1xuZXhwb3J0cy5IID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBoID0gaW5wdXQuZ2V0SG91cnMoKTtcbiAgcmV0dXJuIChoIDwgMTAgPyAnMCcgOiAnJykgKyBoO1xufTtcbmV4cG9ydHMuaSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgbSA9IGlucHV0LmdldE1pbnV0ZXMoKTtcbiAgcmV0dXJuIChtIDwgMTAgPyAnMCcgOiAnJykgKyBtO1xufTtcbmV4cG9ydHMucyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgcyA9IGlucHV0LmdldFNlY29uZHMoKTtcbiAgcmV0dXJuIChzIDwgMTAgPyAnMCcgOiAnJykgKyBzO1xufTtcbi8vdSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcnOyB9LFxuXG4vLyBUaW1lem9uZVxuLy9lID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJyc7IH0sXG4vL0kgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnJzsgfSxcbmV4cG9ydHMuTyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgdHogPSBpbnB1dC5nZXRUaW1lem9uZU9mZnNldCgpO1xuICByZXR1cm4gKHR6IDwgMCA/ICctJyA6ICcrJykgKyAodHogLyA2MCA8IDEwID8gJzAnIDogJycpICsgTWF0aC5hYnMoKHR6IC8gNjApKSArICcwMCc7XG59O1xuLy9UID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJyc7IH0sXG5leHBvcnRzLlogPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldFRpbWV6b25lT2Zmc2V0KCkgKiA2MDtcbn07XG5cbi8vIEZ1bGwgRGF0ZS9UaW1lXG5leHBvcnRzLmMgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LnRvSVNPU3RyaW5nKCk7XG59O1xuZXhwb3J0cy5yID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC50b1VUQ1N0cmluZygpO1xufTtcbmV4cG9ydHMuVSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0VGltZSgpIC8gMTAwMDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2RhdGVmb3JtYXR0ZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyksXG4gIGRhdGVGb3JtYXR0ZXIgPSByZXF1aXJlKCcuL2RhdGVmb3JtYXR0ZXInKTtcblxuLyoqXG4gKiBIZWxwZXIgbWV0aG9kIHRvIHJlY3Vyc2l2ZWx5IHJ1biBhIGZpbHRlciBhY3Jvc3MgYW4gb2JqZWN0L2FycmF5IGFuZCBhcHBseSBpdCB0byBhbGwgb2YgdGhlIG9iamVjdC9hcnJheSdzIHZhbHVlcy5cbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcmV0dXJuIHsqfVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaXRlcmF0ZUZpbHRlcihpbnB1dCkge1xuICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgb3V0ID0ge307XG5cbiAgaWYgKHV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgcmV0dXJuIHV0aWxzLm1hcChpbnB1dCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICByZXR1cm4gc2VsZi5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcpIHtcbiAgICB1dGlscy5lYWNoKGlucHV0LCBmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgb3V0W2tleV0gPSBzZWxmLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybjtcbn1cblxuLyoqXG4gKiBCYWNrc2xhc2gtZXNjYXBlIGNoYXJhY3RlcnMgdGhhdCBuZWVkIHRvIGJlIGVzY2FwZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiXFxcInF1b3RlZCBzdHJpbmdcXFwiXCJ8YWRkc2xhc2hlcyB9fVxuICogLy8gPT4gXFxcInF1b3RlZCBzdHJpbmdcXFwiXG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgQmFja3NsYXNoLWVzY2FwZWQgc3RyaW5nLlxuICovXG5leHBvcnRzLmFkZHNsYXNoZXMgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy5hZGRzbGFzaGVzLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXFwnL2csIFwiXFxcXCdcIikucmVwbGFjZSgvXFxcIi9nLCAnXFxcXFwiJyk7XG59O1xuXG4vKipcbiAqIFVwcGVyLWNhc2UgdGhlIGZpcnN0IGxldHRlciBvZiB0aGUgaW5wdXQgYW5kIGxvd2VyLWNhc2UgdGhlIHJlc3QuXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiaSBsaWtlIEJ1cnJpdG9zXCJ8Y2FwaXRhbGl6ZSB9fVxuICogLy8gPT4gSSBsaWtlIGJ1cnJpdG9zXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXQgIElmIGdpdmVuIGFuIGFycmF5IG9yIG9iamVjdCwgZWFjaCBzdHJpbmcgbWVtYmVyIHdpbGwgYmUgcnVuIHRocm91Z2ggdGhlIGZpbHRlciBpbmRpdmlkdWFsbHkuXG4gKiBAcmV0dXJuIHsqfSAgICAgICAgUmV0dXJucyB0aGUgc2FtZSB0eXBlIGFzIHRoZSBpbnB1dC5cbiAqL1xuZXhwb3J0cy5jYXBpdGFsaXplID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMuY2FwaXRhbGl6ZSwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC50b1N0cmluZygpLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgaW5wdXQudG9TdHJpbmcoKS5zdWJzdHIoMSkudG9Mb3dlckNhc2UoKTtcbn07XG5cbi8qKlxuICogRm9ybWF0IGEgZGF0ZSBvciBEYXRlLWNvbXBhdGlibGUgc3RyaW5nLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBub3cgPSBuZXcgRGF0ZSgpO1xuICoge3sgbm93fGRhdGUoJ1ktbS1kJykgfX1cbiAqIC8vID0+IDIwMTMtMDgtMTRcbiAqXG4gKiBAcGFyYW0gIHs/KHN0cmluZ3xkYXRlKX0gaW5wdXRcbiAqIEBwYXJhbSAge3N0cmluZ30gZm9ybWF0ICBQSFAtc3R5bGUgZGF0ZSBmb3JtYXQgY29tcGF0aWJsZSBzdHJpbmcuXG4gKiBAcGFyYW0gIHtudW1iZXI9fSBvZmZzZXQgVGltZXpvbmUgb2Zmc2V0IGZyb20gR01UIGluIG1pbnV0ZXMuXG4gKiBAcGFyYW0gIHtzdHJpbmc9fSBhYmJyICAgVGltZXpvbmUgYWJicmV2aWF0aW9uLiBVc2VkIGZvciBvdXRwdXQgb25seS5cbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICBGb3JtYXR0ZWQgZGF0ZSBzdHJpbmcuXG4gKi9cbmV4cG9ydHMuZGF0ZSA9IGZ1bmN0aW9uIChpbnB1dCwgZm9ybWF0LCBvZmZzZXQsIGFiYnIpIHtcbiAgdmFyIGwgPSBmb3JtYXQubGVuZ3RoLFxuICAgIGRhdGUgPSBuZXcgZGF0ZUZvcm1hdHRlci5EYXRlWihpbnB1dCksXG4gICAgY3VyLFxuICAgIGkgPSAwLFxuICAgIG91dCA9ICcnO1xuXG4gIGlmIChvZmZzZXQpIHtcbiAgICBkYXRlLnNldFRpbWV6b25lT2Zmc2V0KG9mZnNldCwgYWJicik7XG4gIH1cblxuICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICBjdXIgPSBmb3JtYXQuY2hhckF0KGkpO1xuICAgIGlmIChkYXRlRm9ybWF0dGVyLmhhc093blByb3BlcnR5KGN1cikpIHtcbiAgICAgIG91dCArPSBkYXRlRm9ybWF0dGVyW2N1cl0oZGF0ZSwgb2Zmc2V0LCBhYmJyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0ICs9IGN1cjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogSWYgdGhlIGlucHV0IGlzIGB1bmRlZmluZWRgLCBgbnVsbGAsIG9yIGBmYWxzZWAsIGEgZGVmYXVsdCByZXR1cm4gdmFsdWUgY2FuIGJlIHNwZWNpZmllZC5cbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgbnVsbF92YWx1ZXxkZWZhdWx0KCdUYWNvcycpIH19XG4gKiAvLyA9PiBUYWNvc1xuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcIkJ1cnJpdG9zXCJ8ZGVmYXVsdChcIlRhY29zXCIpIH19XG4gKiAvLyA9PiBCdXJyaXRvc1xuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHBhcmFtICB7Kn0gIGRlZiAgICAgVmFsdWUgdG8gcmV0dXJuIGlmIGBpbnB1dGAgaXMgYHVuZGVmaW5lZGAsIGBudWxsYCwgb3IgYGZhbHNlYC5cbiAqIEByZXR1cm4geyp9ICAgICAgICAgIGBpbnB1dGAgb3IgYGRlZmAgdmFsdWUuXG4gKi9cbmV4cG9ydHNbXCJkZWZhdWx0XCJdID0gZnVuY3Rpb24gKGlucHV0LCBkZWYpIHtcbiAgcmV0dXJuICh0eXBlb2YgaW5wdXQgIT09ICd1bmRlZmluZWQnICYmIChpbnB1dCB8fCB0eXBlb2YgaW5wdXQgPT09ICdudW1iZXInKSkgPyBpbnB1dCA6IGRlZjtcbn07XG5cbi8qKlxuICogRm9yY2UgZXNjYXBlIHRoZSBvdXRwdXQgb2YgdGhlIHZhcmlhYmxlLiBPcHRpb25hbGx5IHVzZSBgZWAgYXMgYSBzaG9ydGN1dCBmaWx0ZXIgbmFtZS4gVGhpcyBmaWx0ZXIgd2lsbCBiZSBhcHBsaWVkIGJ5IGRlZmF1bHQgaWYgYXV0b2VzY2FwZSBpcyB0dXJuZWQgb24uXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiPGJsYWg+XCJ8ZXNjYXBlIH19XG4gKiAvLyA9PiAmbHQ7YmxhaCZndDtcbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCI8YmxhaD5cInxlKFwianNcIikgfX1cbiAqIC8vID0+IFxcdTAwM0NibGFoXFx1MDAzRVxuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcGFyYW0gIHtzdHJpbmd9IFt0eXBlPSdodG1sJ10gICBJZiB5b3UgcGFzcyB0aGUgc3RyaW5nIGpzIGluIGFzIHRoZSB0eXBlLCBvdXRwdXQgd2lsbCBiZSBlc2NhcGVkIHNvIHRoYXQgaXQgaXMgc2FmZSBmb3IgSmF2YVNjcmlwdCBleGVjdXRpb24uXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgRXNjYXBlZCBzdHJpbmcuXG4gKi9cbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24gKGlucHV0LCB0eXBlKSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMuZXNjYXBlLCBhcmd1bWVudHMpLFxuICAgIGlucCA9IGlucHV0LFxuICAgIGkgPSAwLFxuICAgIGNvZGU7XG5cbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0O1xuICB9XG5cbiAgb3V0ID0gJyc7XG5cbiAgc3dpdGNoICh0eXBlKSB7XG4gIGNhc2UgJ2pzJzpcbiAgICBpbnAgPSBpbnAucmVwbGFjZSgvXFxcXC9nLCAnXFxcXHUwMDVDJyk7XG4gICAgZm9yIChpOyBpIDwgaW5wLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb2RlID0gaW5wLmNoYXJDb2RlQXQoaSk7XG4gICAgICBpZiAoY29kZSA8IDMyKSB7XG4gICAgICAgIGNvZGUgPSBjb2RlLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjb2RlID0gKGNvZGUubGVuZ3RoIDwgMikgPyAnMCcgKyBjb2RlIDogY29kZTtcbiAgICAgICAgb3V0ICs9ICdcXFxcdTAwJyArIGNvZGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXQgKz0gaW5wW2ldO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0LnJlcGxhY2UoLyYvZywgJ1xcXFx1MDAyNicpXG4gICAgICAucmVwbGFjZSgvPC9nLCAnXFxcXHUwMDNDJylcbiAgICAgIC5yZXBsYWNlKC8+L2csICdcXFxcdTAwM0UnKVxuICAgICAgLnJlcGxhY2UoL1xcJy9nLCAnXFxcXHUwMDI3JylcbiAgICAgIC5yZXBsYWNlKC9cIi9nLCAnXFxcXHUwMDIyJylcbiAgICAgIC5yZXBsYWNlKC9cXD0vZywgJ1xcXFx1MDAzRCcpXG4gICAgICAucmVwbGFjZSgvLS9nLCAnXFxcXHUwMDJEJylcbiAgICAgIC5yZXBsYWNlKC87L2csICdcXFxcdTAwM0InKTtcblxuICBkZWZhdWx0OlxuICAgIHJldHVybiBpbnAucmVwbGFjZSgvJig/IWFtcDt8bHQ7fGd0O3xxdW90O3wjMzk7KS9nLCAnJmFtcDsnKVxuICAgICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxuICAgICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgICAgLnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG4gIH1cbn07XG5leHBvcnRzLmUgPSBleHBvcnRzLmVzY2FwZTtcblxuLyoqXG4gKiBHZXQgdGhlIGZpcnN0IGl0ZW0gaW4gYW4gYXJyYXkgb3IgY2hhcmFjdGVyIGluIGEgc3RyaW5nLiBBbGwgb3RoZXIgb2JqZWN0cyB3aWxsIGF0dGVtcHQgdG8gcmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSBhdmFpbGFibGUuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FyciA9IFsnYScsICdiJywgJ2MnXVxuICoge3sgbXlfYXJyfGZpcnN0IH19XG4gKiAvLyA9PiBhXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhbCA9ICdUYWNvcydcbiAqIHt7IG15X3ZhbHxmaXJzdCB9fVxuICogLy8gVFxuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgVGhlIGZpcnN0IGl0ZW0gb2YgdGhlIGFycmF5IG9yIGZpcnN0IGNoYXJhY3RlciBvZiB0aGUgc3RyaW5nIGlucHV0LlxuICovXG5leHBvcnRzLmZpcnN0ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnICYmICF1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHZhciBrZXlzID0gdXRpbHMua2V5cyhpbnB1dCk7XG4gICAgcmV0dXJuIGlucHV0W2tleXNbMF1dO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQuc3Vic3RyKDAsIDEpO1xuICB9XG5cbiAgcmV0dXJuIGlucHV0WzBdO1xufTtcblxuLyoqXG4gKiBHcm91cCBhbiBhcnJheSBvZiBvYmplY3RzIGJ5IGEgY29tbW9uIGtleS4gSWYgYW4gYXJyYXkgaXMgbm90IHByb3ZpZGVkLCB0aGUgaW5wdXQgdmFsdWUgd2lsbCBiZSByZXR1cm5lZCB1bnRvdWNoZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHBlb3BsZSA9IFt7IGFnZTogMjMsIG5hbWU6ICdQYXVsJyB9LCB7IGFnZTogMjYsIG5hbWU6ICdKYW5lJyB9LCB7IGFnZTogMjMsIG5hbWU6ICdKaW0nIH1dO1xuICogeyUgZm9yIGFnZWdyb3VwIGluIHBlb3BsZXxncm91cEJ5KCdhZ2UnKSAlfVxuICogICA8aDI+e3sgbG9vcC5rZXkgfX08L2gyPlxuICogICA8dWw+XG4gKiAgICAgeyUgZm9yIHBlcnNvbiBpbiBhZ2Vncm91cCAlfVxuICogICAgIDxsaT57eyBwZXJzb24ubmFtZSB9fTwvbGk+XG4gKiAgICAgeyUgZW5kZm9yICV9XG4gKiAgIDwvdWw+XG4gKiB7JSBlbmRmb3IgJX1cbiAqXG4gKiBAcGFyYW0gIHsqfSAgICAgIGlucHV0IElucHV0IG9iamVjdC5cbiAqIEBwYXJhbSAge3N0cmluZ30ga2V5ICAgS2V5IHRvIGdyb3VwIGJ5LlxuICogQHJldHVybiB7b2JqZWN0fSAgICAgICBHcm91cGVkIGFycmF5cyBieSBnaXZlbiBrZXkuXG4gKi9cbmV4cG9ydHMuZ3JvdXBCeSA9IGZ1bmN0aW9uIChpbnB1dCwga2V5KSB7XG4gIGlmICghdXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICByZXR1cm4gaW5wdXQ7XG4gIH1cblxuICB2YXIgb3V0ID0ge307XG5cbiAgdXRpbHMuZWFjaChpbnB1dCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgaWYgKCF2YWx1ZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGtleW5hbWUgPSB2YWx1ZVtrZXldLFxuICAgICAgbmV3VmFsID0gdXRpbHMuZXh0ZW5kKHt9LCB2YWx1ZSk7XG4gICAgZGVsZXRlIHZhbHVlW2tleV07XG5cbiAgICBpZiAoIW91dFtrZXluYW1lXSkge1xuICAgICAgb3V0W2tleW5hbWVdID0gW107XG4gICAgfVxuXG4gICAgb3V0W2tleW5hbWVdLnB1c2godmFsdWUpO1xuICB9KTtcblxuICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBKb2luIHRoZSBpbnB1dCB3aXRoIGEgc3RyaW5nLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnJheSA9IFsnZm9vJywgJ2JhcicsICdiYXonXVxuICoge3sgbXlfYXJyYXl8am9pbignLCAnKSB9fVxuICogLy8gPT4gZm9vLCBiYXIsIGJhelxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9rZXlfb2JqZWN0ID0geyBhOiAnZm9vJywgYjogJ2JhcicsIGM6ICdiYXonIH1cbiAqIHt7IG15X2tleV9vYmplY3R8am9pbignIGFuZCAnKSB9fVxuICogLy8gPT4gZm9vIGFuZCBiYXIgYW5kIGJhelxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHBhcmFtICB7c3RyaW5nfSBnbHVlICAgIFN0cmluZyB2YWx1ZSB0byBqb2luIGl0ZW1zIHRvZ2V0aGVyLlxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbiAoaW5wdXQsIGdsdWUpIHtcbiAgaWYgKHV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgcmV0dXJuIGlucHV0LmpvaW4oZ2x1ZSk7XG4gIH1cblxuICBpZiAodHlwZW9mIGlucHV0ID09PSAnb2JqZWN0Jykge1xuICAgIHZhciBvdXQgPSBbXTtcbiAgICB1dGlscy5lYWNoKGlucHV0LCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIG91dC5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3V0LmpvaW4oZ2x1ZSk7XG4gIH1cbiAgcmV0dXJuIGlucHV0O1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgYW4gSmF2YVNjcmlwdCBvYmplY3QuXG4gKlxuICogQmFja3dhcmRzIGNvbXBhdGlibGUgd2l0aCBzd2lnQDAueC54IHVzaW5nIGBqc29uX2VuY29kZWAuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9IHsgYTogJ2InIH1cbiAqIHt7IHZhbHxqc29uIH19XG4gKiAvLyA9PiB7XCJhXCI6XCJiXCJ9XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9IHsgYTogJ2InIH1cbiAqIHt7IHZhbHxqc29uKDQpIH19XG4gKiAvLyA9PiB7XG4gKiAvLyAgICAgICAgXCJhXCI6IFwiYlwiXG4gKiAvLyAgICB9XG4gKlxuICogQHBhcmFtICB7Kn0gICAgaW5wdXRcbiAqIEBwYXJhbSAge251bWJlcn0gIFtpbmRlbnRdICBOdW1iZXIgb2Ygc3BhY2VzIHRvIGluZGVudCBmb3IgcHJldHR5LWZvcm1hdHRpbmcuXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICBBIHZhbGlkIEpTT04gc3RyaW5nLlxuICovXG5leHBvcnRzLmpzb24gPSBmdW5jdGlvbiAoaW5wdXQsIGluZGVudCkge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoaW5wdXQsIG51bGwsIGluZGVudCB8fCAwKTtcbn07XG5leHBvcnRzLmpzb25fZW5jb2RlID0gZXhwb3J0cy5qc29uO1xuXG4vKipcbiAqIEdldCB0aGUgbGFzdCBpdGVtIGluIGFuIGFycmF5IG9yIGNoYXJhY3RlciBpbiBhIHN0cmluZy4gQWxsIG90aGVyIG9iamVjdHMgd2lsbCBhdHRlbXB0IHRvIHJldHVybiB0aGUgbGFzdCB2YWx1ZSBhdmFpbGFibGUuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FyciA9IFsnYScsICdiJywgJ2MnXVxuICoge3sgbXlfYXJyfGxhc3QgfX1cbiAqIC8vID0+IGNcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFsID0gJ1RhY29zJ1xuICoge3sgbXlfdmFsfGxhc3QgfX1cbiAqIC8vIHNcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgICAgVGhlIGxhc3QgaXRlbSBvZiB0aGUgYXJyYXkgb3IgbGFzdCBjaGFyYWN0ZXIgb2YgdGhlIHN0cmluZy5pbnB1dC5cbiAqL1xuZXhwb3J0cy5sYXN0ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnICYmICF1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHZhciBrZXlzID0gdXRpbHMua2V5cyhpbnB1dCk7XG4gICAgcmV0dXJuIGlucHV0W2tleXNba2V5cy5sZW5ndGggLSAxXV07XG4gIH1cblxuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5jaGFyQXQoaW5wdXQubGVuZ3RoIC0gMSk7XG4gIH1cblxuICByZXR1cm4gaW5wdXRbaW5wdXQubGVuZ3RoIC0gMV07XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgaW5wdXQgaW4gYWxsIGxvd2VyY2FzZSBsZXR0ZXJzLlxuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcIkZPT0JBUlwifGxvd2VyIH19XG4gKiAvLyA9PiBmb29iYXJcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlPYmogPSB7IGE6ICdGT08nLCBiOiAnQkFSJyB9XG4gKiB7eyBteU9ianxsb3dlcnxqb2luKCcnKSB9fVxuICogLy8gPT4gZm9vYmFyXG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgICBSZXR1cm5zIHRoZSBzYW1lIHR5cGUgYXMgdGhlIGlucHV0LlxuICovXG5leHBvcnRzLmxvd2VyID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMubG93ZXIsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpO1xufTtcblxuLyoqXG4gKiBEZXByZWNhdGVkIGluIGZhdm9yIG9mIDxhIGhyZWY9XCIjc2FmZVwiPnNhZmU8L2E+LlxuICovXG5leHBvcnRzLnJhdyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gZXhwb3J0cy5zYWZlKGlucHV0KTtcbn07XG5leHBvcnRzLnJhdy5zYWZlID0gdHJ1ZTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHN0cmluZyB3aXRoIHRoZSBtYXRjaGVkIHNlYXJjaCBwYXR0ZXJuIHJlcGxhY2VkIGJ5IHRoZSBnaXZlbiByZXBsYWNlbWVudCBzdHJpbmcuIFVzZXMgSmF2YVNjcmlwdCdzIGJ1aWx0LWluIFN0cmluZy5yZXBsYWNlKCkgbWV0aG9kLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YXIgPSAnZm9vYmFyJztcbiAqIHt7IG15X3ZhcnxyZXBsYWNlKCdvJywgJ2UnLCAnZycpIH19XG4gKiAvLyA9PiBmZWViYXJcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFyID0gXCJmYXJmZWdudWdlblwiO1xuICoge3sgbXlfdmFyfHJlcGxhY2UoJ15mJywgJ3AnKSB9fVxuICogLy8gPT4gcGFyZmVnbnVnZW5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFyID0gJ2ExYjJjMyc7XG4gKiB7eyBteV92YXJ8cmVwbGFjZSgnXFx3JywgJzAnLCAnZycpIH19XG4gKiAvLyA9PiAwMTAyMDNcbiAqXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGlucHV0XG4gKiBAcGFyYW0gIHtzdHJpbmd9IHNlYXJjaCAgICAgIFN0cmluZyBvciBwYXR0ZXJuIHRvIHJlcGxhY2UgZnJvbSB0aGUgaW5wdXQuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHJlcGxhY2VtZW50IFN0cmluZyB0byByZXBsYWNlIG1hdGNoZWQgcGF0dGVybi5cbiAqIEBwYXJhbSAge3N0cmluZ30gW2ZsYWdzXSAgICAgIFJlZ3VsYXIgRXhwcmVzc2lvbiBmbGFncy4gJ2cnOiBnbG9iYWwgbWF0Y2gsICdpJzogaWdub3JlIGNhc2UsICdtJzogbWF0Y2ggb3ZlciBtdWx0aXBsZSBsaW5lc1xuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICBSZXBsYWNlZCBzdHJpbmcuXG4gKi9cbmV4cG9ydHMucmVwbGFjZSA9IGZ1bmN0aW9uIChpbnB1dCwgc2VhcmNoLCByZXBsYWNlbWVudCwgZmxhZ3MpIHtcbiAgdmFyIHIgPSBuZXcgUmVnRXhwKHNlYXJjaCwgZmxhZ3MpO1xuICByZXR1cm4gaW5wdXQucmVwbGFjZShyLCByZXBsYWNlbWVudCk7XG59O1xuXG4vKipcbiAqIFJldmVyc2Ugc29ydCB0aGUgaW5wdXQuIFRoaXMgaXMgYW4gYWxpYXMgZm9yIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+e3sgaW5wdXR8c29ydCh0cnVlKSB9fTwvY29kZT4uXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9IFsxLCAyLCAzXTtcbiAqIHt7IHZhbHxyZXZlcnNlIH19XG4gKiAvLyA9PiAzLDIsMVxuICpcbiAqIEBwYXJhbSAge2FycmF5fSAgaW5wdXRcbiAqIEByZXR1cm4ge2FycmF5fSAgICAgICAgUmV2ZXJzZWQgYXJyYXkuIFRoZSBvcmlnaW5hbCBpbnB1dCBvYmplY3QgaXMgcmV0dXJuZWQgaWYgaXQgd2FzIG5vdCBhbiBhcnJheS5cbiAqL1xuZXhwb3J0cy5yZXZlcnNlID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBleHBvcnRzLnNvcnQoaW5wdXQsIHRydWUpO1xufTtcblxuLyoqXG4gKiBGb3JjZXMgdGhlIGlucHV0IHRvIG5vdCBiZSBhdXRvLWVzY2FwZWQuIFVzZSB0aGlzIG9ubHkgb24gY29udGVudCB0aGF0IHlvdSBrbm93IGlzIHNhZmUgdG8gYmUgcmVuZGVyZWQgb24geW91ciBwYWdlLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YXIgPSBcIjxwPlN0dWZmPC9wPlwiO1xuICoge3sgbXlfdmFyfHNhZmUgfX1cbiAqIC8vID0+IDxwPlN0dWZmPC9wPlxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgICAgVGhlIGlucHV0IGV4YWN0bHkgaG93IGl0IHdhcyBnaXZlbiwgcmVnYXJkbGVzcyBvZiBhdXRvZXNjYXBpbmcgc3RhdHVzLlxuICovXG5leHBvcnRzLnNhZmUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgLy8gVGhpcyBpcyBhIG1hZ2ljIGZpbHRlci4gSXRzIGxvZ2ljIGlzIGhhcmQtY29kZWQgaW50byBTd2lnJ3MgcGFyc2VyLlxuICByZXR1cm4gaW5wdXQ7XG59O1xuZXhwb3J0cy5zYWZlLnNhZmUgPSB0cnVlO1xuXG4vKipcbiAqIFNvcnQgdGhlIGlucHV0IGluIGFuIGFzY2VuZGluZyBkaXJlY3Rpb24uXG4gKiBJZiBnaXZlbiBhbiBvYmplY3QsIHdpbGwgcmV0dXJuIHRoZSBrZXlzIGFzIGEgc29ydGVkIGFycmF5LlxuICogSWYgZ2l2ZW4gYSBzdHJpbmcsIGVhY2ggY2hhcmFjdGVyIHdpbGwgYmUgc29ydGVkIGluZGl2aWR1YWxseS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0gWzIsIDYsIDRdO1xuICoge3sgdmFsfHNvcnQgfX1cbiAqIC8vID0+IDIsNCw2XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9ICd6YXEnO1xuICoge3sgdmFsfHNvcnQgfX1cbiAqIC8vID0+IGFxelxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSB7IGJhcjogMSwgZm9vOiAyIH1cbiAqIHt7IHZhbHxzb3J0KHRydWUpIH19XG4gKiAvLyA9PiBmb28sYmFyXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3JldmVyc2U9ZmFsc2VdIE91dHB1dCBpcyBnaXZlbiByZXZlcnNlLXNvcnRlZCBpZiB0cnVlLlxuICogQHJldHVybiB7Kn0gICAgICAgIFNvcnRlZCBhcnJheTtcbiAqL1xuZXhwb3J0cy5zb3J0ID0gZnVuY3Rpb24gKGlucHV0LCByZXZlcnNlKSB7XG4gIHZhciBvdXQ7XG4gIGlmICh1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIG91dCA9IGlucHV0LnNvcnQoKTtcbiAgfSBlbHNlIHtcbiAgICBzd2l0Y2ggKHR5cGVvZiBpbnB1dCkge1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBvdXQgPSB1dGlscy5rZXlzKGlucHV0KS5zb3J0KCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgb3V0ID0gaW5wdXQuc3BsaXQoJycpO1xuICAgICAgaWYgKHJldmVyc2UpIHtcbiAgICAgICAgcmV0dXJuIG91dC5yZXZlcnNlKCkuam9pbignJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3V0LnNvcnQoKS5qb2luKCcnKTtcbiAgICB9XG4gIH1cblxuICBpZiAob3V0ICYmIHJldmVyc2UpIHtcbiAgICByZXR1cm4gb3V0LnJldmVyc2UoKTtcbiAgfVxuXG4gIHJldHVybiBvdXQgfHwgaW5wdXQ7XG59O1xuXG4vKipcbiAqIFN0cmlwIEhUTUwgdGFncy5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gc3R1ZmYgPSAnPHA+Zm9vYmFyPC9wPic7XG4gKiB7eyBzdHVmZnxzdHJpcHRhZ3MgfX1cbiAqIC8vID0+IGZvb2JhclxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgIFJldHVybnMgdGhlIHNhbWUgb2JqZWN0IGFzIHRoZSBpbnB1dCwgYnV0IHdpdGggYWxsIHN0cmluZyB2YWx1ZXMgc3RyaXBwZWQgb2YgdGFncy5cbiAqL1xuZXhwb3J0cy5zdHJpcHRhZ3MgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy5zdHJpcHRhZ3MsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQudG9TdHJpbmcoKS5yZXBsYWNlKC8oPChbXj5dKyk+KS9pZywgJycpO1xufTtcblxuLyoqXG4gKiBDYXBpdGFsaXplcyBldmVyeSB3b3JkIGdpdmVuIGFuZCBsb3dlci1jYXNlcyBhbGwgb3RoZXIgbGV0dGVycy5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfc3RyID0gJ3RoaXMgaXMgc29NZSB0ZXh0JztcbiAqIHt7IG15X3N0cnx0aXRsZSB9fVxuICogLy8gPT4gVGhpcyBJcyBTb21lIFRleHRcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyID0gWydoaScsICd0aGlzJywgJ2lzJywgJ2FuJywgJ2FycmF5J107XG4gKiB7eyBteV9hcnJ8dGl0bGV8am9pbignICcpIH19XG4gKiAvLyA9PiBIaSBUaGlzIElzIEFuIEFycmF5XG4gKlxuICogQHBhcmFtICB7Kn0gIGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICAgUmV0dXJucyB0aGUgc2FtZSBvYmplY3QgYXMgdGhlIGlucHV0LCBidXQgd2l0aCBhbGwgd29yZHMgaW4gc3RyaW5ncyB0aXRsZS1jYXNlZC5cbiAqL1xuZXhwb3J0cy50aXRsZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLnRpdGxlLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnRvU3RyaW5nKCkucmVwbGFjZSgvXFx3XFxTKi9nLCBmdW5jdGlvbiAoc3RyKSB7XG4gICAgcmV0dXJuIHN0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN0ci5zdWJzdHIoMSkudG9Mb3dlckNhc2UoKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJlbW92ZSBhbGwgZHVwbGljYXRlIGl0ZW1zIGZyb20gYW4gYXJyYXkuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FyciA9IFsxLCAyLCAzLCA0LCA0LCAzLCAyLCAxXTtcbiAqIHt7IG15X2Fycnx1bmlxfGpvaW4oJywnKSB9fVxuICogLy8gPT4gMSwyLDMsNFxuICpcbiAqIEBwYXJhbSAge2FycmF5fSAgaW5wdXRcbiAqIEByZXR1cm4ge2FycmF5fSAgICAgICAgQXJyYXkgd2l0aCB1bmlxdWUgaXRlbXMuIElmIGlucHV0IHdhcyBub3QgYW4gYXJyYXksIHRoZSBvcmlnaW5hbCBpdGVtIGlzIHJldHVybmVkIHVudG91Y2hlZC5cbiAqL1xuZXhwb3J0cy51bmlxID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciByZXN1bHQ7XG5cbiAgaWYgKCFpbnB1dCB8fCAhdXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cblxuICByZXN1bHQgPSBbXTtcbiAgdXRpbHMuZWFjaChpbnB1dCwgZnVuY3Rpb24gKHYpIHtcbiAgICBpZiAocmVzdWx0LmluZGV4T2YodikgPT09IC0xKSB7XG4gICAgICByZXN1bHQucHVzaCh2KTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IHRoZSBpbnB1dCB0byBhbGwgdXBwZXJjYXNlIGxldHRlcnMuIElmIGFuIG9iamVjdCBvciBhcnJheSBpcyBwcm92aWRlZCwgYWxsIHZhbHVlcyB3aWxsIGJlIHVwcGVyY2FzZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3N0ciA9ICd0YWNvcyc7XG4gKiB7eyBteV9zdHJ8dXBwZXIgfX1cbiAqIC8vID0+IFRBQ09TXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FyciA9IFsndGFjb3MnLCAnYnVycml0b3MnXTtcbiAqIHt7IG15X2Fycnx1cHBlcnxqb2luKCcgJiAnKSB9fVxuICogLy8gPT4gVEFDT1MgJiBCVVJSSVRPU1xuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgIFJldHVybnMgdGhlIHNhbWUgdHlwZSBhcyB0aGUgaW5wdXQsIHdpdGggYWxsIHN0cmluZ3MgdXBwZXItY2FzZWQuXG4gKi9cbmV4cG9ydHMudXBwZXIgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy51cHBlciwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC50b1N0cmluZygpLnRvVXBwZXJDYXNlKCk7XG59O1xuXG4vKipcbiAqIFVSTC1lbmNvZGUgYSBzdHJpbmcuIElmIGFuIG9iamVjdCBvciBhcnJheSBpcyBwYXNzZWQsIGFsbCB2YWx1ZXMgd2lsbCBiZSBVUkwtZW5jb2RlZC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfc3RyID0gJ3BhcmFtPTEmYW5vdGhlclBhcmFtPTInO1xuICoge3sgbXlfc3RyfHVybF9lbmNvZGUgfX1cbiAqIC8vID0+IHBhcmFtJTNEMSUyNmFub3RoZXJQYXJhbSUzRDJcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgVVJMLWVuY29kZWQgc3RyaW5nLlxuICovXG5leHBvcnRzLnVybF9lbmNvZGUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy51cmxfZW5jb2RlLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoaW5wdXQpO1xufTtcblxuLyoqXG4gKiBVUkwtZGVjb2RlIGEgc3RyaW5nLiBJZiBhbiBvYmplY3Qgb3IgYXJyYXkgaXMgcGFzc2VkLCBhbGwgdmFsdWVzIHdpbGwgYmUgVVJMLWRlY29kZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3N0ciA9ICdwYXJhbSUzRDElMjZhbm90aGVyUGFyYW0lM0QyJztcbiAqIHt7IG15X3N0cnx1cmxfZGVjb2RlIH19XG4gKiAvLyA9PiBwYXJhbT0xJmFub3RoZXJQYXJhbT0yXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgIFVSTC1kZWNvZGVkIHN0cmluZy5cbiAqL1xuZXhwb3J0cy51cmxfZGVjb2RlID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMudXJsX2RlY29kZSwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KGlucHV0KTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2ZpbHRlcnMuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8qKlxuICogQSBsZXhlciB0b2tlbi5cbiAqIEB0eXBlZGVmIHtvYmplY3R9IExleGVyVG9rZW5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBtYXRjaCAgVGhlIHN0cmluZyB0aGF0IHdhcyBtYXRjaGVkLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHR5cGUgICBMZXhlciB0eXBlIGVudW0uXG4gKiBAcHJvcGVydHkge251bWJlcn0gbGVuZ3RoIExlbmd0aCBvZiB0aGUgb3JpZ2luYWwgc3RyaW5nIHByb2Nlc3NlZC5cbiAqL1xuXG4vKipcbiAqIEVudW0gZm9yIHRva2VuIHR5cGVzLlxuICogQHJlYWRvbmx5XG4gKiBAZW51bSB7bnVtYmVyfVxuICovXG52YXIgVFlQRVMgPSB7XG4gICAgLyoqIFdoaXRlc3BhY2UgKi9cbiAgICBXSElURVNQQUNFOiAwLFxuICAgIC8qKiBQbGFpbiBzdHJpbmcgKi9cbiAgICBTVFJJTkc6IDEsXG4gICAgLyoqIFZhcmlhYmxlIGZpbHRlciAqL1xuICAgIEZJTFRFUjogMixcbiAgICAvKiogRW1wdHkgdmFyaWFibGUgZmlsdGVyICovXG4gICAgRklMVEVSRU1QVFk6IDMsXG4gICAgLyoqIEZ1bmN0aW9uICovXG4gICAgRlVOQ1RJT046IDQsXG4gICAgLyoqIEZ1bmN0aW9uIHdpdGggbm8gYXJndW1lbnRzICovXG4gICAgRlVOQ1RJT05FTVBUWTogNSxcbiAgICAvKiogT3BlbiBwYXJlbnRoZXNpcyAqL1xuICAgIFBBUkVOT1BFTjogNixcbiAgICAvKiogQ2xvc2UgcGFyZW50aGVzaXMgKi9cbiAgICBQQVJFTkNMT1NFOiA3LFxuICAgIC8qKiBDb21tYSAqL1xuICAgIENPTU1BOiA4LFxuICAgIC8qKiBWYXJpYWJsZSAqL1xuICAgIFZBUjogOSxcbiAgICAvKiogTnVtYmVyICovXG4gICAgTlVNQkVSOiAxMCxcbiAgICAvKiogTWF0aCBvcGVyYXRvciAqL1xuICAgIE9QRVJBVE9SOiAxMSxcbiAgICAvKiogT3BlbiBzcXVhcmUgYnJhY2tldCAqL1xuICAgIEJSQUNLRVRPUEVOOiAxMixcbiAgICAvKiogQ2xvc2Ugc3F1YXJlIGJyYWNrZXQgKi9cbiAgICBCUkFDS0VUQ0xPU0U6IDEzLFxuICAgIC8qKiBLZXkgb24gYW4gb2JqZWN0IHVzaW5nIGRvdC1ub3RhdGlvbiAqL1xuICAgIERPVEtFWTogMTQsXG4gICAgLyoqIFN0YXJ0IG9mIGFuIGFycmF5ICovXG4gICAgQVJSQVlPUEVOOiAxNSxcbiAgICAvKiogRW5kIG9mIGFuIGFycmF5XG4gICAgICogQ3VycmVudGx5IHVudXNlZFxuICAgIEFSUkFZQ0xPU0U6IDE2LCAqL1xuICAgIC8qKiBPcGVuIGN1cmx5IGJyYWNlICovXG4gICAgQ1VSTFlPUEVOOiAxNyxcbiAgICAvKiogQ2xvc2UgY3VybHkgYnJhY2UgKi9cbiAgICBDVVJMWUNMT1NFOiAxOCxcbiAgICAvKiogQ29sb24gKDopICovXG4gICAgQ09MT046IDE5LFxuICAgIC8qKiBKYXZhU2NyaXB0LXZhbGlkIGNvbXBhcmF0b3IgKi9cbiAgICBDT01QQVJBVE9SOiAyMCxcbiAgICAvKiogQm9vbGVhbiBsb2dpYyAqL1xuICAgIExPR0lDOiAyMSxcbiAgICAvKiogQm9vbGVhbiBsb2dpYyBcIm5vdFwiICovXG4gICAgTk9UOiAyMixcbiAgICAvKiogdHJ1ZSBvciBmYWxzZSAqL1xuICAgIEJPT0w6IDIzLFxuICAgIC8qKiBWYXJpYWJsZSBhc3NpZ25tZW50ICovXG4gICAgQVNTSUdOTUVOVDogMjQsXG4gICAgLyoqIFN0YXJ0IG9mIGEgbWV0aG9kICovXG4gICAgTUVUSE9ET1BFTjogMjUsXG4gICAgLyoqIEVuZCBvZiBhIG1ldGhvZFxuICAgICAqIEN1cnJlbnRseSB1bnVzZWRcbiAgICBNRVRIT0RFTkQ6IDI2LCAqL1xuICAgIC8qKiBVbmtub3duIHR5cGUgKi9cbiAgICBVTktOT1dOOiAxMDBcbiAgfSxcbiAgcnVsZXMgPSBbXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuV0hJVEVTUEFDRSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFxzKy9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLlNUUklORyxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXCJcIi8sXG4gICAgICAgIC9eXCIuKj9bXlxcXFxdXCIvLFxuICAgICAgICAvXicnLyxcbiAgICAgICAgL14nLio/W15cXFxcXScvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5GSUxURVIsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcfFxccyooXFx3KylcXCgvXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5GSUxURVJFTVBUWSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFx8XFxzKihcXHcrKS9cbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkZVTkNUSU9ORU1QVFksXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxccyooXFx3KylcXChcXCkvXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5GVU5DVElPTixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFxzKihcXHcrKVxcKC9cbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLlBBUkVOT1BFTixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFwoL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuUEFSRU5DTE9TRSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFwpL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQ09NTUEsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXiwvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5MT0dJQyxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eKCYmfFxcfFxcfClcXHMqLyxcbiAgICAgICAgL14oYW5kfG9yKVxccysvXG4gICAgICBdLFxuICAgICAgaWR4OiAxLFxuICAgICAgcmVwbGFjZToge1xuICAgICAgICAnYW5kJzogJyYmJyxcbiAgICAgICAgJ29yJzogJ3x8J1xuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQ09NUEFSQVRPUixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eKD09PXw9PXxcXCE9PXxcXCE9fDw9fDx8Pj18Pnxpblxcc3xndGVcXHN8Z3RcXHN8bHRlXFxzfGx0XFxzKVxccyovXG4gICAgICBdLFxuICAgICAgaWR4OiAxLFxuICAgICAgcmVwbGFjZToge1xuICAgICAgICAnZ3RlJzogJz49JyxcbiAgICAgICAgJ2d0JzogJz4nLFxuICAgICAgICAnbHRlJzogJzw9JyxcbiAgICAgICAgJ2x0JzogJzwnXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5BU1NJR05NRU5ULFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14oPXxcXCs9fC09fFxcKj18XFwvPSkvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5OT1QsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcIVxccyovLFxuICAgICAgICAvXm5vdFxccysvXG4gICAgICBdLFxuICAgICAgcmVwbGFjZToge1xuICAgICAgICAnbm90JzogJyEnXG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5CT09MLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14odHJ1ZXxmYWxzZSlcXHMrLyxcbiAgICAgICAgL14odHJ1ZXxmYWxzZSkkL1xuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuVkFSLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15bYS16QS1aXyRdXFx3KigoXFwuXFx3KikrKT8vLFxuICAgICAgICAvXlthLXpBLVpfJF1cXHcqL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQlJBQ0tFVE9QRU4sXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcWy9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkJSQUNLRVRDTE9TRSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFxdL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQ1VSTFlPUEVOLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHsvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5DT0xPTixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFw6L1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQ1VSTFlDTE9TRSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFx9L1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuRE9US0VZLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXC4oXFx3KykvLFxuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuTlVNQkVSLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15bK1xcLV0/XFxkKyhcXC5cXGQrKT8vXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5PUEVSQVRPUixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eKFxcK3xcXC18XFwvfFxcKnwlKS9cbiAgICAgIF1cbiAgICB9XG4gIF07XG5cbmV4cG9ydHMudHlwZXMgPSBUWVBFUztcblxuLyoqXG4gKiBSZXR1cm4gdGhlIHRva2VuIHR5cGUgb2JqZWN0IGZvciBhIHNpbmdsZSBjaHVuayBvZiBhIHN0cmluZy5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3RyIFN0cmluZyBjaHVuay5cbiAqIEByZXR1cm4ge0xleGVyVG9rZW59ICAgICBEZWZpbmVkIHR5cGUsIHBvdGVudGlhbGx5IHN0cmlwcGVkIG9yIHJlcGxhY2VkIHdpdGggbW9yZSBzdWl0YWJsZSBjb250ZW50LlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVhZGVyKHN0cikge1xuICB2YXIgbWF0Y2hlZDtcblxuICB1dGlscy5zb21lKHJ1bGVzLCBmdW5jdGlvbiAocnVsZSkge1xuICAgIHJldHVybiB1dGlscy5zb21lKHJ1bGUucmVnZXgsIGZ1bmN0aW9uIChyZWdleCkge1xuICAgICAgdmFyIG1hdGNoID0gc3RyLm1hdGNoKHJlZ2V4KSxcbiAgICAgICAgbm9ybWFsaXplZDtcblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIG5vcm1hbGl6ZWQgPSBtYXRjaFtydWxlLmlkeCB8fCAwXS5yZXBsYWNlKC9cXHMqJC8sICcnKTtcbiAgICAgIG5vcm1hbGl6ZWQgPSAocnVsZS5oYXNPd25Qcm9wZXJ0eSgncmVwbGFjZScpICYmIHJ1bGUucmVwbGFjZS5oYXNPd25Qcm9wZXJ0eShub3JtYWxpemVkKSkgPyBydWxlLnJlcGxhY2Vbbm9ybWFsaXplZF0gOiBub3JtYWxpemVkO1xuXG4gICAgICBtYXRjaGVkID0ge1xuICAgICAgICBtYXRjaDogbm9ybWFsaXplZCxcbiAgICAgICAgdHlwZTogcnVsZS50eXBlLFxuICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICB9KTtcblxuICBpZiAoIW1hdGNoZWQpIHtcbiAgICBtYXRjaGVkID0ge1xuICAgICAgbWF0Y2g6IHN0cixcbiAgICAgIHR5cGU6IFRZUEVTLlVOS05PV04sXG4gICAgICBsZW5ndGg6IHN0ci5sZW5ndGhcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIG1hdGNoZWQ7XG59XG5cbi8qKlxuICogUmVhZCBhIHN0cmluZyBhbmQgYnJlYWsgaXQgaW50byBzZXBhcmF0ZSB0b2tlbiB0eXBlcy5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtBcnJheS5MZXhlclRva2VufSAgICAgQXJyYXkgb2YgZGVmaW5lZCB0eXBlcywgcG90ZW50aWFsbHkgc3RyaXBwZWQgb3IgcmVwbGFjZWQgd2l0aCBtb3JlIHN1aXRhYmxlIGNvbnRlbnQuXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnRzLnJlYWQgPSBmdW5jdGlvbiAoc3RyKSB7XG4gIHZhciBvZmZzZXQgPSAwLFxuICAgIHRva2VucyA9IFtdLFxuICAgIHN1YnN0cixcbiAgICBtYXRjaDtcbiAgd2hpbGUgKG9mZnNldCA8IHN0ci5sZW5ndGgpIHtcbiAgICBzdWJzdHIgPSBzdHIuc3Vic3RyaW5nKG9mZnNldCk7XG4gICAgbWF0Y2ggPSByZWFkZXIoc3Vic3RyKTtcbiAgICBvZmZzZXQgKz0gbWF0Y2gubGVuZ3RoO1xuICAgIHRva2Vucy5wdXNoKG1hdGNoKTtcbiAgfVxuICByZXR1cm4gdG9rZW5zO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbGV4ZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgZnMgPSByZXF1aXJlKCdmcycpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4vKipcbiAqIExvYWRzIHRlbXBsYXRlcyBmcm9tIHRoZSBmaWxlIHN5c3RlbS5cbiAqIEBhbGlhcyBzd2lnLmxvYWRlcnMuZnNcbiAqIEBleGFtcGxlXG4gKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMuZnMoKSB9KTtcbiAqIEBleGFtcGxlXG4gKiAvLyBMb2FkIFRlbXBsYXRlcyBmcm9tIGEgc3BlY2lmaWMgZGlyZWN0b3J5IChkb2VzIG5vdCByZXF1aXJlIHVzaW5nIHJlbGF0aXZlIHBhdGhzIGluIHlvdXIgdGVtcGxhdGVzKVxuICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLmZzKF9fZGlybmFtZSArICcvdGVtcGxhdGVzJyApfSk7XG4gKiBAcGFyYW0ge3N0cmluZ30gICBbYmFzZXBhdGg9JyddICAgICBQYXRoIHRvIHRoZSB0ZW1wbGF0ZXMgYXMgc3RyaW5nLiBBc3NpZ25pbmcgdGhpcyB2YWx1ZSBhbGxvd3MgeW91IHRvIHVzZSBzZW1pLWFic29sdXRlIHBhdGhzIHRvIHRlbXBsYXRlcyBpbnN0ZWFkIG9mIHJlbGF0aXZlIHBhdGhzLlxuICogQHBhcmFtIHtzdHJpbmd9ICAgW2VuY29kaW5nPSd1dGY4J10gICBUZW1wbGF0ZSBlbmNvZGluZ1xuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlcGF0aCwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldCA9IHt9O1xuXG4gIGVuY29kaW5nID0gZW5jb2RpbmcgfHwgJ3V0ZjgnO1xuICBiYXNlcGF0aCA9IChiYXNlcGF0aCkgPyBwYXRoLm5vcm1hbGl6ZShiYXNlcGF0aCkgOiBudWxsO1xuXG4gIC8qKlxuICAgKiBSZXNvbHZlcyA8dmFyPnRvPC92YXI+IHRvIGFuIGFic29sdXRlIHBhdGggb3IgdW5pcXVlIGlkZW50aWZpZXIuIFRoaXMgaXMgdXNlZCBmb3IgYnVpbGRpbmcgY29ycmVjdCwgbm9ybWFsaXplZCwgYW5kIGFic29sdXRlIHBhdGhzIHRvIGEgZ2l2ZW4gdGVtcGxhdGUuXG4gICAqIEBhbGlhcyByZXNvbHZlXG4gICAqIEBwYXJhbSAge3N0cmluZ30gdG8gICAgICAgIE5vbi1hYnNvbHV0ZSBpZGVudGlmaWVyIG9yIHBhdGhuYW1lIHRvIGEgZmlsZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBbZnJvbV0gICAgSWYgZ2l2ZW4sIHNob3VsZCBhdHRlbXB0IHRvIGZpbmQgdGhlIDx2YXI+dG88L3Zhcj4gcGF0aCBpbiByZWxhdGlvbiB0byB0aGlzIGdpdmVuLCBrbm93biBwYXRoLlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAqL1xuICByZXQucmVzb2x2ZSA9IGZ1bmN0aW9uICh0bywgZnJvbSkge1xuICAgIGlmIChiYXNlcGF0aCkge1xuICAgICAgZnJvbSA9IGJhc2VwYXRoO1xuICAgIH0gZWxzZSB7XG4gICAgICBmcm9tID0gKGZyb20pID8gcGF0aC5kaXJuYW1lKGZyb20pIDogJy8nO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKGZyb20sIHRvKTtcbiAgfTtcblxuICAvKipcbiAgICogTG9hZHMgYSBzaW5nbGUgdGVtcGxhdGUuIEdpdmVuIGEgdW5pcXVlIDx2YXI+aWRlbnRpZmllcjwvdmFyPiBmb3VuZCBieSB0aGUgPHZhcj5yZXNvbHZlPC92YXI+IG1ldGhvZCB0aGlzIHNob3VsZCByZXR1cm4gdGhlIGdpdmVuIHRlbXBsYXRlLlxuICAgKiBAYWxpYXMgbG9hZFxuICAgKiBAcGFyYW0gIHtzdHJpbmd9ICAgaWRlbnRpZmllciAgVW5pcXVlIGlkZW50aWZpZXIgb2YgYSB0ZW1wbGF0ZSAocG9zc2libHkgYW4gYWJzb2x1dGUgcGF0aCkuXG4gICAqIEBwYXJhbSAge2Z1bmN0aW9ufSBbY2JdICAgICAgICBBc3luY2hyb25vdXMgY2FsbGJhY2sgZnVuY3Rpb24uIElmIG5vdCBwcm92aWRlZCwgdGhpcyBtZXRob2Qgc2hvdWxkIHJ1biBzeW5jaHJvbm91c2x5LlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgICAgVGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAgICovXG4gIHJldC5sb2FkID0gZnVuY3Rpb24gKGlkZW50aWZpZXIsIGNiKSB7XG4gICAgaWYgKCFmcyB8fCAoY2IgJiYgIWZzLnJlYWRGaWxlKSB8fCAhZnMucmVhZEZpbGVTeW5jKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBmaW5kIGZpbGUgJyArIGlkZW50aWZpZXIgKyAnIGJlY2F1c2UgdGhlcmUgaXMgbm8gZmlsZXN5c3RlbSB0byByZWFkIGZyb20uJyk7XG4gICAgfVxuXG4gICAgaWRlbnRpZmllciA9IHJldC5yZXNvbHZlKGlkZW50aWZpZXIpO1xuXG4gICAgaWYgKGNiKSB7XG4gICAgICBmcy5yZWFkRmlsZShpZGVudGlmaWVyLCBlbmNvZGluZywgY2IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGlkZW50aWZpZXIsIGVuY29kaW5nKTtcbiAgfTtcblxuICByZXR1cm4gcmV0O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVycy9maWxlc3lzdGVtLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIEBuYW1lc3BhY2UgVGVtcGxhdGVMb2FkZXJcbiAqIEBkZXNjcmlwdGlvbiBTd2lnIGlzIGFibGUgdG8gYWNjZXB0IGN1c3RvbSB0ZW1wbGF0ZSBsb2FkZXJzIHdyaXR0ZW4gYnkgeW91LCBzbyB0aGF0IHlvdXIgdGVtcGxhdGVzIGNhbiBjb21lIGZyb20geW91ciBmYXZvcml0ZSBzdG9yYWdlIG1lZGl1bSB3aXRob3V0IG5lZWRpbmcgdG8gYmUgcGFydCBvZiB0aGUgY29yZSBsaWJyYXJ5LlxuICogQSB0ZW1wbGF0ZSBsb2FkZXIgY29uc2lzdHMgb2YgdHdvIG1ldGhvZHM6IDx2YXI+cmVzb2x2ZTwvdmFyPiBhbmQgPHZhcj5sb2FkPC92YXI+LiBFYWNoIG1ldGhvZCBpcyB1c2VkIGludGVybmFsbHkgYnkgU3dpZyB0byBmaW5kIGFuZCBsb2FkIHRoZSBzb3VyY2Ugb2YgdGhlIHRlbXBsYXRlIGJlZm9yZSBhdHRlbXB0aW5nIHRvIHBhcnNlIGFuZCBjb21waWxlIGl0LlxuICogQGV4YW1wbGVcbiAqIC8vIEEgdGhlb3JldGljYWwgbWVtY2FjaGVkIGxvYWRlclxuICogdmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gKiAgIE1lbWNhY2hlZCA9IHJlcXVpcmUoJ21lbWNhY2hlZCcpO1xuICogZnVuY3Rpb24gbWVtY2FjaGVkTG9hZGVyKGxvY2F0aW9ucywgb3B0aW9ucykge1xuICogICB2YXIgbWVtY2FjaGVkID0gbmV3IE1lbWNhY2hlZChsb2NhdGlvbnMsIG9wdGlvbnMpO1xuICogICByZXR1cm4ge1xuICogICAgIHJlc29sdmU6IGZ1bmN0aW9uICh0bywgZnJvbSkge1xuICogICAgICAgcmV0dXJuIHBhdGgucmVzb2x2ZShmcm9tLCB0byk7XG4gKiAgICAgfSxcbiAqICAgICBsb2FkOiBmdW5jdGlvbiAoaWRlbnRpZmllciwgY2IpIHtcbiAqICAgICAgIG1lbWNhY2hlZC5nZXQoaWRlbnRpZmllciwgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICogICAgICAgICAvLyBpZiAoIWRhdGEpIHsgbG9hZCBmcm9tIGZpbGVzeXN0ZW07IH1cbiAqICAgICAgICAgY2IoZXJyLCBkYXRhKTtcbiAqICAgICAgIH0pO1xuICogICAgIH1cbiAqICAgfTtcbiAqIH07XG4gKiAvLyBUZWxsIHN3aWcgYWJvdXQgdGhlIGxvYWRlcjpcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IG1lbWNhY2hlZExvYWRlcihbJzE5Mi4xNjguMC4yJ10pIH0pO1xuICovXG5cbi8qKlxuICogQGZ1bmN0aW9uXG4gKiBAbmFtZSByZXNvbHZlXG4gKiBAbWVtYmVyb2YgVGVtcGxhdGVMb2FkZXJcbiAqIEBkZXNjcmlwdGlvblxuICogUmVzb2x2ZXMgPHZhcj50bzwvdmFyPiB0byBhbiBhYnNvbHV0ZSBwYXRoIG9yIHVuaXF1ZSBpZGVudGlmaWVyLiBUaGlzIGlzIHVzZWQgZm9yIGJ1aWxkaW5nIGNvcnJlY3QsIG5vcm1hbGl6ZWQsIGFuZCBhYnNvbHV0ZSBwYXRocyB0byBhIGdpdmVuIHRlbXBsYXRlLlxuICogQHBhcmFtICB7c3RyaW5nfSB0byAgICAgICAgTm9uLWFic29sdXRlIGlkZW50aWZpZXIgb3IgcGF0aG5hbWUgdG8gYSBmaWxlLlxuICogQHBhcmFtICB7c3RyaW5nfSBbZnJvbV0gICAgSWYgZ2l2ZW4sIHNob3VsZCBhdHRlbXB0IHRvIGZpbmQgdGhlIDx2YXI+dG88L3Zhcj4gcGF0aCBpbiByZWxhdGlvbiB0byB0aGlzIGdpdmVuLCBrbm93biBwYXRoLlxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5cbi8qKlxuICogQGZ1bmN0aW9uXG4gKiBAbmFtZSBsb2FkXG4gKiBAbWVtYmVyb2YgVGVtcGxhdGVMb2FkZXJcbiAqIEBkZXNjcmlwdGlvblxuICogTG9hZHMgYSBzaW5nbGUgdGVtcGxhdGUuIEdpdmVuIGEgdW5pcXVlIDx2YXI+aWRlbnRpZmllcjwvdmFyPiBmb3VuZCBieSB0aGUgPHZhcj5yZXNvbHZlPC92YXI+IG1ldGhvZCB0aGlzIHNob3VsZCByZXR1cm4gdGhlIGdpdmVuIHRlbXBsYXRlLlxuICogQHBhcmFtICB7c3RyaW5nfSAgIGlkZW50aWZpZXIgIFVuaXF1ZSBpZGVudGlmaWVyIG9mIGEgdGVtcGxhdGUgKHBvc3NpYmx5IGFuIGFic29sdXRlIHBhdGgpLlxuICogQHBhcmFtICB7ZnVuY3Rpb259IFtjYl0gICAgICAgIEFzeW5jaHJvbm91cyBjYWxsYmFjayBmdW5jdGlvbi4gSWYgbm90IHByb3ZpZGVkLCB0aGlzIG1ldGhvZCBzaG91bGQgcnVuIHN5bmNocm9ub3VzbHkuXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgICAgVGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAqL1xuXG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuZnMgPSByZXF1aXJlKCcuL2ZpbGVzeXN0ZW0nKTtcbmV4cG9ydHMubWVtb3J5ID0gcmVxdWlyZSgnLi9tZW1vcnknKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVycy9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBMb2FkcyB0ZW1wbGF0ZXMgZnJvbSBhIHByb3ZpZGVkIG9iamVjdCBtYXBwaW5nLlxuICogQGFsaWFzIHN3aWcubG9hZGVycy5tZW1vcnlcbiAqIEBleGFtcGxlXG4gKiB2YXIgdGVtcGxhdGVzID0ge1xuICogICBcImxheW91dFwiOiBcInslIGJsb2NrIGNvbnRlbnQgJX17JSBlbmRibG9jayAlfVwiLFxuICogICBcImhvbWUuaHRtbFwiOiBcInslIGV4dGVuZHMgJ2xheW91dC5odG1sJyAlfXslIGJsb2NrIGNvbnRlbnQgJX0uLi57JSBlbmRibG9jayAlfVwiXG4gKiB9O1xuICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLm1lbW9yeSh0ZW1wbGF0ZXMpIH0pO1xuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBtYXBwaW5nIEhhc2ggb2JqZWN0IHdpdGggdGVtcGxhdGUgcGF0aHMgYXMga2V5cyBhbmQgdGVtcGxhdGUgc291cmNlcyBhcyB2YWx1ZXMuXG4gKiBAcGFyYW0ge3N0cmluZ30gW2Jhc2VwYXRoXSBQYXRoIHRvIHRoZSB0ZW1wbGF0ZXMgYXMgc3RyaW5nLiBBc3NpZ25pbmcgdGhpcyB2YWx1ZSBhbGxvd3MgeW91IHRvIHVzZSBzZW1pLWFic29sdXRlIHBhdGhzIHRvIHRlbXBsYXRlcyBpbnN0ZWFkIG9mIHJlbGF0aXZlIHBhdGhzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtYXBwaW5nLCBiYXNlcGF0aCkge1xuICB2YXIgcmV0ID0ge307XG5cbiAgYmFzZXBhdGggPSAoYmFzZXBhdGgpID8gcGF0aC5ub3JtYWxpemUoYmFzZXBhdGgpIDogbnVsbDtcblxuICAvKipcbiAgICogUmVzb2x2ZXMgPHZhcj50bzwvdmFyPiB0byBhbiBhYnNvbHV0ZSBwYXRoIG9yIHVuaXF1ZSBpZGVudGlmaWVyLiBUaGlzIGlzIHVzZWQgZm9yIGJ1aWxkaW5nIGNvcnJlY3QsIG5vcm1hbGl6ZWQsIGFuZCBhYnNvbHV0ZSBwYXRocyB0byBhIGdpdmVuIHRlbXBsYXRlLlxuICAgKiBAYWxpYXMgcmVzb2x2ZVxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHRvICAgICAgICBOb24tYWJzb2x1dGUgaWRlbnRpZmllciBvciBwYXRobmFtZSB0byBhIGZpbGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gW2Zyb21dICAgIElmIGdpdmVuLCBzaG91bGQgYXR0ZW1wdCB0byBmaW5kIHRoZSA8dmFyPnRvPC92YXI+IHBhdGggaW4gcmVsYXRpb24gdG8gdGhpcyBnaXZlbiwga25vd24gcGF0aC5cbiAgICogQHJldHVybiB7c3RyaW5nfVxuICAgKi9cbiAgcmV0LnJlc29sdmUgPSBmdW5jdGlvbiAodG8sIGZyb20pIHtcbiAgICBpZiAoYmFzZXBhdGgpIHtcbiAgICAgIGZyb20gPSBiYXNlcGF0aDtcbiAgICB9IGVsc2Uge1xuICAgICAgZnJvbSA9IChmcm9tKSA/IHBhdGguZGlybmFtZShmcm9tKSA6ICcvJztcbiAgICB9XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShmcm9tLCB0byk7XG4gIH07XG5cbiAgLyoqXG4gICAqIExvYWRzIGEgc2luZ2xlIHRlbXBsYXRlLiBHaXZlbiBhIHVuaXF1ZSA8dmFyPmlkZW50aWZpZXI8L3Zhcj4gZm91bmQgYnkgdGhlIDx2YXI+cmVzb2x2ZTwvdmFyPiBtZXRob2QgdGhpcyBzaG91bGQgcmV0dXJuIHRoZSBnaXZlbiB0ZW1wbGF0ZS5cbiAgICogQGFsaWFzIGxvYWRcbiAgICogQHBhcmFtICB7c3RyaW5nfSAgIGlkZW50aWZpZXIgIFVuaXF1ZSBpZGVudGlmaWVyIG9mIGEgdGVtcGxhdGUgKHBvc3NpYmx5IGFuIGFic29sdXRlIHBhdGgpLlxuICAgKiBAcGFyYW0gIHtmdW5jdGlvbn0gW2NiXSAgICAgICAgQXN5bmNocm9ub3VzIGNhbGxiYWNrIGZ1bmN0aW9uLiBJZiBub3QgcHJvdmlkZWQsIHRoaXMgbWV0aG9kIHNob3VsZCBydW4gc3luY2hyb25vdXNseS5cbiAgICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICAgIFRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gICAqL1xuICByZXQubG9hZCA9IGZ1bmN0aW9uIChwYXRobmFtZSwgY2IpIHtcbiAgICB2YXIgc3JjLCBwYXRocztcblxuICAgIHBhdGhzID0gW3BhdGhuYW1lLCBwYXRobmFtZS5yZXBsYWNlKC9eKFxcL3xcXFxcKS8sICcnKV07XG5cbiAgICBzcmMgPSBtYXBwaW5nW3BhdGhzWzBdXSB8fCBtYXBwaW5nW3BhdGhzWzFdXTtcbiAgICBpZiAoIXNyYykge1xuICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5hYmxlIHRvIGZpbmQgdGVtcGxhdGUgXCInICsgcGF0aG5hbWUgKyAnXCIuJyk7XG4gICAgfVxuXG4gICAgaWYgKGNiKSB7XG4gICAgICBjYihudWxsLCBzcmMpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gc3JjO1xuICB9O1xuXG4gIHJldHVybiByZXQ7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL21lbW9yeS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpLFxuICBsZXhlciA9IHJlcXVpcmUoJy4vbGV4ZXInKTtcblxudmFyIF90ID0gbGV4ZXIudHlwZXMsXG4gIF9yZXNlcnZlZCA9IFsnYnJlYWsnLCAnY2FzZScsICdjYXRjaCcsICdjb250aW51ZScsICdkZWJ1Z2dlcicsICdkZWZhdWx0JywgJ2RlbGV0ZScsICdkbycsICdlbHNlJywgJ2ZpbmFsbHknLCAnZm9yJywgJ2Z1bmN0aW9uJywgJ2lmJywgJ2luJywgJ2luc3RhbmNlb2YnLCAnbmV3JywgJ3JldHVybicsICdzd2l0Y2gnLCAndGhpcycsICd0aHJvdycsICd0cnknLCAndHlwZW9mJywgJ3ZhcicsICd2b2lkJywgJ3doaWxlJywgJ3dpdGgnXTtcblxuXG4vKipcbiAqIEZpbHRlcnMgYXJlIHNpbXBseSBmdW5jdGlvbnMgdGhhdCBwZXJmb3JtIHRyYW5zZm9ybWF0aW9ucyBvbiB0aGVpciBmaXJzdCBpbnB1dCBhcmd1bWVudC5cbiAqIEZpbHRlcnMgYXJlIHJ1biBhdCByZW5kZXIgdGltZSwgc28gdGhleSBtYXkgbm90IGRpcmVjdGx5IG1vZGlmeSB0aGUgY29tcGlsZWQgdGVtcGxhdGUgc3RydWN0dXJlIGluIGFueSB3YXkuXG4gKiBBbGwgb2YgU3dpZydzIGJ1aWx0LWluIGZpbHRlcnMgYXJlIHdyaXR0ZW4gaW4gdGhpcyBzYW1lIHdheS4gRm9yIG1vcmUgZXhhbXBsZXMsIHJlZmVyZW5jZSB0aGUgYGZpbHRlcnMuanNgIGZpbGUgaW4gU3dpZydzIHNvdXJjZS5cbiAqXG4gKiBUbyBkaXNhYmxlIGF1dG8tZXNjYXBpbmcgb24gYSBjdXN0b20gZmlsdGVyLCBzaW1wbHkgYWRkIGEgcHJvcGVydHkgdG8gdGhlIGZpbHRlciBtZXRob2QgYHNhZmUgPSB0cnVlO2AgYW5kIHRoZSBvdXRwdXQgZnJvbSB0aGlzIHdpbGwgbm90IGJlIGVzY2FwZWQsIG5vIG1hdHRlciB3aGF0IHRoZSBnbG9iYWwgc2V0dGluZ3MgYXJlIGZvciBTd2lnLlxuICpcbiAqIEB0eXBlZGVmIHtmdW5jdGlvbn0gRmlsdGVyXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIFRoaXMgZmlsdGVyIHdpbGwgcmV0dXJuICdiYXpib3AnIGlmIHRoZSBpZHggb24gdGhlIGlucHV0IGlzIG5vdCAnZm9vYmFyJ1xuICogc3dpZy5zZXRGaWx0ZXIoJ2Zvb2JhcicsIGZ1bmN0aW9uIChpbnB1dCwgaWR4KSB7XG4gKiAgIHJldHVybiBpbnB1dFtpZHhdID09PSAnZm9vYmFyJyA/IGlucHV0W2lkeF0gOiAnYmF6Ym9wJztcbiAqIH0pO1xuICogLy8gbXl2YXIgPSBbJ2ZvbycsICdiYXInLCAnYmF6JywgJ2JvcCddO1xuICogLy8gPT4ge3sgbXl2YXJ8Zm9vYmFyKDMpIH19XG4gKiAvLyBTaW5jZSBteXZhclszXSAhPT0gJ2Zvb2JhcicsIHdlIHJlbmRlcjpcbiAqIC8vID0+IGJhemJvcFxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBUaGlzIGZpbHRlciB3aWxsIGRpc2FibGUgYXV0by1lc2NhcGluZyBvbiBpdHMgb3V0cHV0OlxuICogZnVuY3Rpb24gYmF6Ym9wIChpbnB1dCkgeyByZXR1cm4gaW5wdXQ7IH1cbiAqIGJhemJvcC5zYWZlID0gdHJ1ZTtcbiAqIHN3aWcuc2V0RmlsdGVyKCdiYXpib3AnLCBiYXpib3ApO1xuICogLy8gPT4ge3sgXCI8cD5cInxiYXpib3AgfX1cbiAqIC8vID0+IDxwPlxuICpcbiAqIEBwYXJhbSB7Kn0gaW5wdXQgSW5wdXQgYXJndW1lbnQsIGF1dG9tYXRpY2FsbHkgc2VudCBmcm9tIFN3aWcncyBidWlsdC1pbiBwYXJzZXIuXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSBBbGwgb3RoZXIgYXJndW1lbnRzIGFyZSBkZWZpbmVkIGJ5IHRoZSBGaWx0ZXIgYXV0aG9yLlxuICogQHJldHVybiB7Kn1cbiAqL1xuXG4vKiFcbiAqIE1ha2VzIGEgc3RyaW5nIHNhZmUgZm9yIGEgcmVndWxhciBleHByZXNzaW9uLlxuICogQHBhcmFtICB7c3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGVzY2FwZVJlZ0V4cChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXFwtXFwvXFxcXFxcXiQqKz8uKCl8XFxbXFxde31dL2csICdcXFxcJCYnKTtcbn1cblxuLyoqXG4gKiBQYXJzZSBzdHJpbmdzIG9mIHZhcmlhYmxlcyBhbmQgdGFncyBpbnRvIHRva2VucyBmb3IgZnV0dXJlIGNvbXBpbGF0aW9uLlxuICogQGNsYXNzXG4gKiBAcGFyYW0ge2FycmF5fSAgIHRva2VucyAgICAgUHJlLXNwbGl0IHRva2VucyByZWFkIGJ5IHRoZSBMZXhlci5cbiAqIEBwYXJhbSB7b2JqZWN0fSAgZmlsdGVycyAgICBLZXllZCBvYmplY3Qgb2YgZmlsdGVycyB0aGF0IG1heSBiZSBhcHBsaWVkIHRvIHZhcmlhYmxlcy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gYXV0b2VzY2FwZSBXaGV0aGVyIG9yIG5vdCB0aGlzIHNob3VsZCBiZSBhdXRvZXNjYXBlZC5cbiAqIEBwYXJhbSB7bnVtYmVyfSAgbGluZSAgICAgICBCZWdpbm5pbmcgbGluZSBudW1iZXIgZm9yIHRoZSBmaXJzdCB0b2tlbi5cbiAqIEBwYXJhbSB7c3RyaW5nfSAgW2ZpbGVuYW1lXSBOYW1lIG9mIHRoZSBmaWxlIGJlaW5nIHBhcnNlZC5cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIFRva2VuUGFyc2VyKHRva2VucywgZmlsdGVycywgYXV0b2VzY2FwZSwgbGluZSwgZmlsZW5hbWUpIHtcbiAgdGhpcy5vdXQgPSBbXTtcbiAgdGhpcy5zdGF0ZSA9IFtdO1xuICB0aGlzLmZpbHRlckFwcGx5SWR4ID0gW107XG4gIHRoaXMuX3BhcnNlcnMgPSB7fTtcbiAgdGhpcy5saW5lID0gbGluZTtcbiAgdGhpcy5maWxlbmFtZSA9IGZpbGVuYW1lO1xuICB0aGlzLmZpbHRlcnMgPSBmaWx0ZXJzO1xuICB0aGlzLmVzY2FwZSA9IGF1dG9lc2NhcGU7XG5cbiAgdGhpcy5wYXJzZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoc2VsZi5fcGFyc2Vycy5zdGFydCkge1xuICAgICAgc2VsZi5fcGFyc2Vycy5zdGFydC5jYWxsKHNlbGYpO1xuICAgIH1cbiAgICB1dGlscy5lYWNoKHRva2VucywgZnVuY3Rpb24gKHRva2VuLCBpKSB7XG4gICAgICB2YXIgcHJldlRva2VuID0gdG9rZW5zW2kgLSAxXTtcbiAgICAgIHNlbGYuaXNMYXN0ID0gKGkgPT09IHRva2Vucy5sZW5ndGggLSAxKTtcbiAgICAgIGlmIChwcmV2VG9rZW4pIHtcbiAgICAgICAgd2hpbGUgKHByZXZUb2tlbi50eXBlID09PSBfdC5XSElURVNQQUNFKSB7XG4gICAgICAgICAgaSAtPSAxO1xuICAgICAgICAgIHByZXZUb2tlbiA9IHRva2Vuc1tpIC0gMV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNlbGYucHJldlRva2VuID0gcHJldlRva2VuO1xuICAgICAgc2VsZi5wYXJzZVRva2VuKHRva2VuKTtcbiAgICB9KTtcbiAgICBpZiAoc2VsZi5fcGFyc2Vycy5lbmQpIHtcbiAgICAgIHNlbGYuX3BhcnNlcnMuZW5kLmNhbGwoc2VsZik7XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuZXNjYXBlKSB7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4ID0gWzBdO1xuICAgICAgaWYgKHR5cGVvZiBzZWxmLmVzY2FwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgc2VsZi5wYXJzZVRva2VuKHsgdHlwZTogX3QuRklMVEVSLCBtYXRjaDogJ2UnIH0pO1xuICAgICAgICBzZWxmLnBhcnNlVG9rZW4oeyB0eXBlOiBfdC5DT01NQSwgbWF0Y2g6ICcsJyB9KTtcbiAgICAgICAgc2VsZi5wYXJzZVRva2VuKHsgdHlwZTogX3QuU1RSSU5HLCBtYXRjaDogU3RyaW5nKGF1dG9lc2NhcGUpIH0pO1xuICAgICAgICBzZWxmLnBhcnNlVG9rZW4oeyB0eXBlOiBfdC5QQVJFTkNMT1NFLCBtYXRjaDogJyknfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnBhcnNlVG9rZW4oeyB0eXBlOiBfdC5GSUxURVJFTVBUWSwgbWF0Y2g6ICdlJyB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZi5vdXQ7XG4gIH07XG59XG5cblRva2VuUGFyc2VyLnByb3RvdHlwZSA9IHtcbiAgLyoqXG4gICAqIFNldCBhIGN1c3RvbSBtZXRob2QgdG8gYmUgY2FsbGVkIHdoZW4gYSB0b2tlbiB0eXBlIGlzIGZvdW5kLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBwYXJzZXIub24odHlwZXMuU1RSSU5HLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICogICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICogfSk7XG4gICAqIEBleGFtcGxlXG4gICAqIHBhcnNlci5vbignc3RhcnQnLCBmdW5jdGlvbiAoKSB7XG4gICAqICAgdGhpcy5vdXQucHVzaCgnc29tZXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgb2YgeW91ciBhcmdzJylcbiAgICogfSk7XG4gICAqIHBhcnNlci5vbignZW5kJywgZnVuY3Rpb24gKCkge1xuICAgKiAgIHRoaXMub3V0LnB1c2goJ3NvbWV0aGluZyBhdCB0aGUgZW5kIG9mIHlvdXIgYXJncycpO1xuICAgKiB9KTtcbiAgICpcbiAgICogQHBhcmFtICB7bnVtYmVyfSAgIHR5cGUgVG9rZW4gdHlwZSBJRC4gRm91bmQgaW4gdGhlIExleGVyLlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICBDYWxsYmFjayBmdW5jdGlvbi4gUmV0dXJuIHRydWUgdG8gY29udGludWUgZXhlY3V0aW5nIHRoZSBkZWZhdWx0IHBhcnNpbmcgZnVuY3Rpb24uXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICovXG4gIG9uOiBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICB0aGlzLl9wYXJzZXJzW3R5cGVdID0gZm47XG4gIH0sXG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgc2luZ2xlIHRva2VuLlxuICAgKiBAcGFyYW0gIHt7bWF0Y2g6IHN0cmluZywgdHlwZTogbnVtYmVyLCBsaW5lOiBudW1iZXJ9fSB0b2tlbiBMZXhlciB0b2tlbiBvYmplY3QuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHBhcnNlVG9rZW46IGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciBzZWxmID0gdGhpcyxcbiAgICAgIGZuID0gc2VsZi5fcGFyc2Vyc1t0b2tlbi50eXBlXSB8fCBzZWxmLl9wYXJzZXJzWycqJ10sXG4gICAgICBtYXRjaCA9IHRva2VuLm1hdGNoLFxuICAgICAgcHJldlRva2VuID0gc2VsZi5wcmV2VG9rZW4sXG4gICAgICBwcmV2VG9rZW5UeXBlID0gcHJldlRva2VuID8gcHJldlRva2VuLnR5cGUgOiBudWxsLFxuICAgICAgbGFzdFN0YXRlID0gKHNlbGYuc3RhdGUubGVuZ3RoKSA/IHNlbGYuc3RhdGVbc2VsZi5zdGF0ZS5sZW5ndGggLSAxXSA6IG51bGwsXG4gICAgICB0ZW1wO1xuXG4gICAgaWYgKGZuICYmIHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgaWYgKCFmbi5jYWxsKHRoaXMsIHRva2VuKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGxhc3RTdGF0ZSAmJiBwcmV2VG9rZW4gJiZcbiAgICAgICAgbGFzdFN0YXRlID09PSBfdC5GSUxURVIgJiZcbiAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuRklMVEVSICYmXG4gICAgICAgIHRva2VuLnR5cGUgIT09IF90LlBBUkVOQ0xPU0UgJiZcbiAgICAgICAgdG9rZW4udHlwZSAhPT0gX3QuQ09NTUEgJiZcbiAgICAgICAgdG9rZW4udHlwZSAhPT0gX3QuT1BFUkFUT1IgJiZcbiAgICAgICAgdG9rZW4udHlwZSAhPT0gX3QuRklMVEVSICYmXG4gICAgICAgIHRva2VuLnR5cGUgIT09IF90LkZJTFRFUkVNUFRZKSB7XG4gICAgICBzZWxmLm91dC5wdXNoKCcsICcpO1xuICAgIH1cblxuICAgIGlmIChsYXN0U3RhdGUgJiYgbGFzdFN0YXRlID09PSBfdC5NRVRIT0RPUEVOKSB7XG4gICAgICBzZWxmLnN0YXRlLnBvcCgpO1xuICAgICAgaWYgKHRva2VuLnR5cGUgIT09IF90LlBBUkVOQ0xPU0UpIHtcbiAgICAgICAgc2VsZi5vdXQucHVzaCgnLCAnKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzd2l0Y2ggKHRva2VuLnR5cGUpIHtcbiAgICBjYXNlIF90LldISVRFU1BBQ0U6XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuU1RSSU5HOlxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCk7XG4gICAgICBzZWxmLm91dC5wdXNoKG1hdGNoLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90Lk5VTUJFUjpcbiAgICBjYXNlIF90LkJPT0w6XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoKTtcbiAgICAgIHNlbGYub3V0LnB1c2gobWF0Y2gpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkZJTFRFUjpcbiAgICAgIGlmICghc2VsZi5maWx0ZXJzLmhhc093blByb3BlcnR5KG1hdGNoKSB8fCB0eXBlb2Ygc2VsZi5maWx0ZXJzW21hdGNoXSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ0ludmFsaWQgZmlsdGVyIFwiJyArIG1hdGNoICsgJ1wiJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuZXNjYXBlID0gc2VsZi5maWx0ZXJzW21hdGNoXS5zYWZlID8gZmFsc2UgOiBzZWxmLmVzY2FwZTtcbiAgICAgIHRlbXAgPSBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgc2VsZi5vdXQuc3BsaWNlKHRlbXAsIDAsICdfZmlsdGVyc1tcIicgKyBtYXRjaCArICdcIl0oJyk7XG4gICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2godGVtcCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuRklMVEVSRU1QVFk6XG4gICAgICBpZiAoIXNlbGYuZmlsdGVycy5oYXNPd25Qcm9wZXJ0eShtYXRjaCkgfHwgdHlwZW9mIHNlbGYuZmlsdGVyc1ttYXRjaF0gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdJbnZhbGlkIGZpbHRlciBcIicgKyBtYXRjaCArICdcIicsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLmVzY2FwZSA9IHNlbGYuZmlsdGVyc1ttYXRjaF0uc2FmZSA/IGZhbHNlIDogc2VsZi5lc2NhcGU7XG4gICAgICBzZWxmLm91dC5zcGxpY2Uoc2VsZi5maWx0ZXJBcHBseUlkeFtzZWxmLmZpbHRlckFwcGx5SWR4Lmxlbmd0aCAtIDFdLCAwLCAnX2ZpbHRlcnNbXCInICsgbWF0Y2ggKyAnXCJdKCcpO1xuICAgICAgc2VsZi5vdXQucHVzaCgnKScpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkZVTkNUSU9OOlxuICAgIGNhc2UgX3QuRlVOQ1RJT05FTVBUWTpcbiAgICAgIHNlbGYub3V0LnB1c2goJygodHlwZW9mIF9jdHguJyArIG1hdGNoICsgJyAhPT0gXCJ1bmRlZmluZWRcIikgPyBfY3R4LicgKyBtYXRjaCArXG4gICAgICAgICcgOiAoKHR5cGVvZiAnICsgbWF0Y2ggKyAnICE9PSBcInVuZGVmaW5lZFwiKSA/ICcgKyBtYXRjaCArXG4gICAgICAgICcgOiBfZm4pKSgnKTtcbiAgICAgIHNlbGYuZXNjYXBlID0gZmFsc2U7XG4gICAgICBpZiAodG9rZW4udHlwZSA9PT0gX3QuRlVOQ1RJT05FTVBUWSkge1xuICAgICAgICBzZWxmLm91dFtzZWxmLm91dC5sZW5ndGggLSAxXSA9IHNlbGYub3V0W3NlbGYub3V0Lmxlbmd0aCAtIDFdICsgJyknO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgfVxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCAtIDEpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LlBBUkVOT1BFTjpcbiAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIGlmIChzZWxmLmZpbHRlckFwcGx5SWR4Lmxlbmd0aCkge1xuICAgICAgICBzZWxmLm91dC5zcGxpY2Uoc2VsZi5maWx0ZXJBcHBseUlkeFtzZWxmLmZpbHRlckFwcGx5SWR4Lmxlbmd0aCAtIDFdLCAwLCAnKCcpO1xuICAgICAgICBpZiAocHJldlRva2VuICYmIHByZXZUb2tlblR5cGUgPT09IF90LlZBUikge1xuICAgICAgICAgIHRlbXAgPSBwcmV2VG9rZW4ubWF0Y2guc3BsaXQoJy4nKS5zbGljZSgwLCAtMSk7XG4gICAgICAgICAgc2VsZi5vdXQucHVzaCgnIHx8IF9mbikuY2FsbCgnICsgc2VsZi5jaGVja01hdGNoKHRlbXApKTtcbiAgICAgICAgICBzZWxmLnN0YXRlLnB1c2goX3QuTUVUSE9ET1BFTik7XG4gICAgICAgICAgc2VsZi5lc2NhcGUgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzZWxmLm91dC5wdXNoKCcgfHwgX2ZuKSgnKTtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoIC0gMyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLm91dC5wdXNoKCcoJyk7XG4gICAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGggLSAxKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5QQVJFTkNMT1NFOlxuICAgICAgdGVtcCA9IHNlbGYuc3RhdGUucG9wKCk7XG4gICAgICBpZiAodGVtcCAhPT0gX3QuUEFSRU5PUEVOICYmIHRlbXAgIT09IF90LkZVTkNUSU9OICYmIHRlbXAgIT09IF90LkZJTFRFUikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdNaXNtYXRjaGVkIG5lc3Rpbmcgc3RhdGUnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnKScpO1xuICAgICAgLy8gT25jZSBvZmYgdGhlIHByZXZpb3VzIGVudHJ5XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgLy8gT25jZSBmb3IgdGhlIG9wZW4gcGFyZW5cbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQ09NTUE6XG4gICAgICBpZiAobGFzdFN0YXRlICE9PSBfdC5GVU5DVElPTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gX3QuRklMVEVSICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSBfdC5BUlJBWU9QRU4gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IF90LkNVUkxZT1BFTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gX3QuUEFSRU5PUEVOICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSBfdC5DT0xPTikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGNvbW1hJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIGlmIChsYXN0U3RhdGUgPT09IF90LkNPTE9OKSB7XG4gICAgICAgIHNlbGYuc3RhdGUucG9wKCk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCcsICcpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5MT0dJQzpcbiAgICBjYXNlIF90LkNPTVBBUkFUT1I6XG4gICAgICBpZiAoIXByZXZUb2tlbiB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LkNPTU1BIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gdG9rZW4udHlwZSB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LkJSQUNLRVRPUEVOIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuQ1VSTFlPUEVOIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuUEFSRU5PUEVOIHx8XG4gICAgICAgICAgcHJldlRva2VuVHlwZSA9PT0gX3QuRlVOQ1RJT04pIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBsb2dpYycsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5OT1Q6XG4gICAgICBzZWxmLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5WQVI6XG4gICAgICBzZWxmLnBhcnNlVmFyKHRva2VuLCBtYXRjaCwgbGFzdFN0YXRlKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5CUkFDS0VUT1BFTjpcbiAgICAgIGlmICghcHJldlRva2VuIHx8XG4gICAgICAgICAgKHByZXZUb2tlblR5cGUgIT09IF90LlZBUiAmJlxuICAgICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuQlJBQ0tFVENMT1NFICYmXG4gICAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5QQVJFTkNMT1NFKSkge1xuICAgICAgICBzZWxmLnN0YXRlLnB1c2goX3QuQVJSQVlPUEVOKTtcbiAgICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCdbJyk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQlJBQ0tFVENMT1NFOlxuICAgICAgdGVtcCA9IHNlbGYuc3RhdGUucG9wKCk7XG4gICAgICBpZiAodGVtcCAhPT0gX3QuQlJBQ0tFVE9QRU4gJiYgdGVtcCAhPT0gX3QuQVJSQVlPUEVOKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgY2xvc2luZyBzcXVhcmUgYnJhY2tldCcsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCddJyk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkNVUkxZT1BFTjpcbiAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIHNlbGYub3V0LnB1c2goJ3snKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGggLSAxKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5DT0xPTjpcbiAgICAgIGlmIChsYXN0U3RhdGUgIT09IF90LkNVUkxZT1BFTikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGNvbG9uJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIHNlbGYub3V0LnB1c2goJzonKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQ1VSTFlDTE9TRTpcbiAgICAgIGlmIChsYXN0U3RhdGUgPT09IF90LkNPTE9OKSB7XG4gICAgICAgIHNlbGYuc3RhdGUucG9wKCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VsZi5zdGF0ZS5wb3AoKSAhPT0gX3QuQ1VSTFlPUEVOKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgY2xvc2luZyBjdXJseSBicmFjZScsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKCd9Jyk7XG5cbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuRE9US0VZOlxuICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgKFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LlZBUiAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkJSQUNLRVRDTE9TRSAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkRPVEtFWSAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LlBBUkVOQ0xPU0UgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5GVU5DVElPTkVNUFRZICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuRklMVEVSRU1QVFkgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5DVVJMWUNMT1NFXG4gICAgICAgICkpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBrZXkgXCInICsgbWF0Y2ggKyAnXCInLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnLicgKyBtYXRjaCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuT1BFUkFUT1I6XG4gICAgICBzZWxmLm91dC5wdXNoKCcgJyArIG1hdGNoICsgJyAnKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIFBhcnNlIHZhcmlhYmxlIHRva2VuXG4gICAqIEBwYXJhbSAge3ttYXRjaDogc3RyaW5nLCB0eXBlOiBudW1iZXIsIGxpbmU6IG51bWJlcn19IHRva2VuICAgICAgTGV4ZXIgdG9rZW4gb2JqZWN0LlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IG1hdGNoICAgICAgIFNob3J0Y3V0IGZvciB0b2tlbi5tYXRjaFxuICAgKiBAcGFyYW0gIHtudW1iZXJ9IGxhc3RTdGF0ZSAgIExleGVyIHRva2VuIHR5cGUgc3RhdGUuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHBhcnNlVmFyOiBmdW5jdGlvbiAodG9rZW4sIG1hdGNoLCBsYXN0U3RhdGUpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBtYXRjaCA9IG1hdGNoLnNwbGl0KCcuJyk7XG5cbiAgICBpZiAoX3Jlc2VydmVkLmluZGV4T2YobWF0Y2hbMF0pICE9PSAtMSkge1xuICAgICAgdXRpbHMudGhyb3dFcnJvcignUmVzZXJ2ZWQga2V5d29yZCBcIicgKyBtYXRjaFswXSArICdcIiBhdHRlbXB0ZWQgdG8gYmUgdXNlZCBhcyBhIHZhcmlhYmxlJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICB9XG5cbiAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoKTtcbiAgICBpZiAobGFzdFN0YXRlID09PSBfdC5DVVJMWU9QRU4pIHtcbiAgICAgIGlmIChtYXRjaC5sZW5ndGggPiAxKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgZG90Jywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2gobWF0Y2hbMF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNlbGYub3V0LnB1c2goc2VsZi5jaGVja01hdGNoKG1hdGNoKSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybiBjb250ZXh0dWFsIGRvdC1jaGVjayBzdHJpbmcgZm9yIGEgbWF0Y2hcbiAgICogQHBhcmFtICB7c3RyaW5nfSBtYXRjaCAgICAgICBTaG9ydGN1dCBmb3IgdG9rZW4ubWF0Y2hcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGNoZWNrTWF0Y2g6IGZ1bmN0aW9uIChtYXRjaCkge1xuICAgIHZhciB0ZW1wID0gbWF0Y2hbMF07XG5cbiAgICBmdW5jdGlvbiBjaGVja0RvdChjdHgpIHtcbiAgICAgIHZhciBjID0gY3R4ICsgdGVtcCxcbiAgICAgICAgbSA9IG1hdGNoLFxuICAgICAgICBidWlsZCA9ICcnO1xuXG4gICAgICBidWlsZCA9ICcodHlwZW9mICcgKyBjICsgJyAhPT0gXCJ1bmRlZmluZWRcIic7XG4gICAgICB1dGlscy5lYWNoKG0sIGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGJ1aWxkICs9ICcgJiYgJyArIGMgKyAnLicgKyB2ICsgJyAhPT0gdW5kZWZpbmVkJztcbiAgICAgICAgYyArPSAnLicgKyB2O1xuICAgICAgfSk7XG4gICAgICBidWlsZCArPSAnKSc7XG5cbiAgICAgIHJldHVybiBidWlsZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZERvdChjdHgpIHtcbiAgICAgIHJldHVybiAnKCcgKyBjaGVja0RvdChjdHgpICsgJyA/ICcgKyBjdHggKyBtYXRjaC5qb2luKCcuJykgKyAnIDogXCJcIiknO1xuICAgIH1cblxuICAgIHJldHVybiAnKCcgKyBjaGVja0RvdCgnX2N0eC4nKSArICcgPyAnICsgYnVpbGREb3QoJ19jdHguJykgKyAnIDogJyArIGJ1aWxkRG90KCcnKSArICcpJztcbiAgfVxufTtcblxuLyoqXG4gKiBQYXJzZSBhIHNvdXJjZSBzdHJpbmcgaW50byB0b2tlbnMgdGhhdCBhcmUgcmVhZHkgZm9yIGNvbXBpbGF0aW9uLlxuICpcbiAqIEBleGFtcGxlXG4gKiBleHBvcnRzLnBhcnNlKCd7eyB0YWNvcyB9fScsIHt9LCB0YWdzLCBmaWx0ZXJzKTtcbiAqIC8vID0+IFt7IGNvbXBpbGU6IFtGdW5jdGlvbl0sIC4uLiB9XVxuICpcbiAqIEBwYXJhbSAge3N0cmluZ30gc291cmNlICBTd2lnIHRlbXBsYXRlIHNvdXJjZS5cbiAqIEBwYXJhbSAge29iamVjdH0gb3B0cyAgICBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtICB7b2JqZWN0fSB0YWdzICAgIEtleWVkIG9iamVjdCBvZiB0YWdzIHRoYXQgY2FuIGJlIHBhcnNlZCBhbmQgY29tcGlsZWQuXG4gKiBAcGFyYW0gIHtvYmplY3R9IGZpbHRlcnMgS2V5ZWQgb2JqZWN0IG9mIGZpbHRlcnMgdGhhdCBtYXkgYmUgYXBwbGllZCB0byB2YXJpYWJsZXMuXG4gKiBAcmV0dXJuIHthcnJheX0gICAgICAgICAgTGlzdCBvZiB0b2tlbnMgcmVhZHkgZm9yIGNvbXBpbGF0aW9uLlxuICovXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHNvdXJjZSwgb3B0cywgdGFncywgZmlsdGVycykge1xuICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSgvXFxyXFxuL2csICdcXG4nKTtcbiAgdmFyIGVzY2FwZSA9IG9wdHMuYXV0b2VzY2FwZSxcbiAgICB0YWdPcGVuID0gb3B0cy50YWdDb250cm9sc1swXSxcbiAgICB0YWdDbG9zZSA9IG9wdHMudGFnQ29udHJvbHNbMV0sXG4gICAgdmFyT3BlbiA9IG9wdHMudmFyQ29udHJvbHNbMF0sXG4gICAgdmFyQ2xvc2UgPSBvcHRzLnZhckNvbnRyb2xzWzFdLFxuICAgIGVzY2FwZWRUYWdPcGVuID0gZXNjYXBlUmVnRXhwKHRhZ09wZW4pLFxuICAgIGVzY2FwZWRUYWdDbG9zZSA9IGVzY2FwZVJlZ0V4cCh0YWdDbG9zZSksXG4gICAgZXNjYXBlZFZhck9wZW4gPSBlc2NhcGVSZWdFeHAodmFyT3BlbiksXG4gICAgZXNjYXBlZFZhckNsb3NlID0gZXNjYXBlUmVnRXhwKHZhckNsb3NlKSxcbiAgICB0YWdTdHJpcCA9IG5ldyBSZWdFeHAoJ14nICsgZXNjYXBlZFRhZ09wZW4gKyAnLT9cXFxccyotP3wtP1xcXFxzKi0/JyArIGVzY2FwZWRUYWdDbG9zZSArICckJywgJ2cnKSxcbiAgICB0YWdTdHJpcEJlZm9yZSA9IG5ldyBSZWdFeHAoJ14nICsgZXNjYXBlZFRhZ09wZW4gKyAnLScpLFxuICAgIHRhZ1N0cmlwQWZ0ZXIgPSBuZXcgUmVnRXhwKCctJyArIGVzY2FwZWRUYWdDbG9zZSArICckJyksXG4gICAgdmFyU3RyaXAgPSBuZXcgUmVnRXhwKCdeJyArIGVzY2FwZWRWYXJPcGVuICsgJy0/XFxcXHMqLT98LT9cXFxccyotPycgKyBlc2NhcGVkVmFyQ2xvc2UgKyAnJCcsICdnJyksXG4gICAgdmFyU3RyaXBCZWZvcmUgPSBuZXcgUmVnRXhwKCdeJyArIGVzY2FwZWRWYXJPcGVuICsgJy0nKSxcbiAgICB2YXJTdHJpcEFmdGVyID0gbmV3IFJlZ0V4cCgnLScgKyBlc2NhcGVkVmFyQ2xvc2UgKyAnJCcpLFxuICAgIGNtdE9wZW4gPSBvcHRzLmNtdENvbnRyb2xzWzBdLFxuICAgIGNtdENsb3NlID0gb3B0cy5jbXRDb250cm9sc1sxXSxcbiAgICBhbnlDaGFyID0gJ1tcXFxcc1xcXFxTXSo/JyxcbiAgICAvLyBTcGxpdCB0aGUgdGVtcGxhdGUgc291cmNlIGJhc2VkIG9uIHZhcmlhYmxlLCB0YWcsIGFuZCBjb21tZW50IGJsb2Nrc1xuICAgIC8vIC8oXFx7JVtcXHNcXFNdKj8lXFx9fFxce1xce1tcXHNcXFNdKj9cXH1cXH18XFx7I1tcXHNcXFNdKj8jXFx9KS9cbiAgICBzcGxpdHRlciA9IG5ldyBSZWdFeHAoXG4gICAgICAnKCcgK1xuICAgICAgICBlc2NhcGVkVGFnT3BlbiArIGFueUNoYXIgKyBlc2NhcGVkVGFnQ2xvc2UgKyAnfCcgK1xuICAgICAgICBlc2NhcGVkVmFyT3BlbiArIGFueUNoYXIgKyBlc2NhcGVkVmFyQ2xvc2UgKyAnfCcgK1xuICAgICAgICBlc2NhcGVSZWdFeHAoY210T3BlbikgKyBhbnlDaGFyICsgZXNjYXBlUmVnRXhwKGNtdENsb3NlKSArXG4gICAgICAgICcpJ1xuICAgICksXG4gICAgbGluZSA9IDEsXG4gICAgc3RhY2sgPSBbXSxcbiAgICBwYXJlbnQgPSBudWxsLFxuICAgIHRva2VucyA9IFtdLFxuICAgIGJsb2NrcyA9IHt9LFxuICAgIGluUmF3ID0gZmFsc2UsXG4gICAgc3RyaXBOZXh0O1xuXG4gIC8qKlxuICAgKiBQYXJzZSBhIHZhcmlhYmxlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHN0ciAgU3RyaW5nIGNvbnRlbnRzIG9mIHRoZSB2YXJpYWJsZSwgYmV0d2VlbiA8aT57ezwvaT4gYW5kIDxpPn19PC9pPlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyIHRoYXQgdGhpcyB2YXJpYWJsZSBzdGFydHMgb24uXG4gICAqIEByZXR1cm4ge1ZhclRva2VufSAgICAgIFBhcnNlZCB2YXJpYWJsZSB0b2tlbiBvYmplY3QuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBwYXJzZVZhcmlhYmxlKHN0ciwgbGluZSkge1xuICAgIHZhciB0b2tlbnMgPSBsZXhlci5yZWFkKHV0aWxzLnN0cmlwKHN0cikpLFxuICAgICAgcGFyc2VyLFxuICAgICAgb3V0O1xuXG4gICAgcGFyc2VyID0gbmV3IFRva2VuUGFyc2VyKHRva2VucywgZmlsdGVycywgZXNjYXBlLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICBvdXQgPSBwYXJzZXIucGFyc2UoKS5qb2luKCcnKTtcblxuICAgIGlmIChwYXJzZXIuc3RhdGUubGVuZ3RoKSB7XG4gICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmFibGUgdG8gcGFyc2UgXCInICsgc3RyICsgJ1wiJywgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSBwYXJzZWQgdmFyaWFibGUgdG9rZW4uXG4gICAgICogQHR5cGVkZWYge29iamVjdH0gVmFyVG9rZW5cbiAgICAgKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBjb21waWxlIE1ldGhvZCBmb3IgY29tcGlsaW5nIHRoaXMgdG9rZW4uXG4gICAgICovXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbXBpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICdfb3V0cHV0ICs9ICcgKyBvdXQgKyAnO1xcbic7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuICBleHBvcnRzLnBhcnNlVmFyaWFibGUgPSBwYXJzZVZhcmlhYmxlO1xuXG4gIC8qKlxuICAgKiBQYXJzZSBhIHRhZy5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBzdHIgIFN0cmluZyBjb250ZW50cyBvZiB0aGUgdGFnLCBiZXR3ZWVuIDxpPnslPC9pPiBhbmQgPGk+JX08L2k+XG4gICAqIEBwYXJhbSAge251bWJlcn0gbGluZSBUaGUgbGluZSBudW1iZXIgdGhhdCB0aGlzIHRhZyBzdGFydHMgb24uXG4gICAqIEByZXR1cm4ge1RhZ1Rva2VufSAgICAgIFBhcnNlZCB0b2tlbiBvYmplY3QuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBwYXJzZVRhZyhzdHIsIGxpbmUpIHtcbiAgICB2YXIgdG9rZW5zLCBwYXJzZXIsIGNodW5rcywgdGFnTmFtZSwgdGFnLCBhcmdzLCBsYXN0O1xuXG4gICAgaWYgKHV0aWxzLnN0YXJ0c1dpdGgoc3RyLCAnZW5kJykpIHtcbiAgICAgIGxhc3QgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcbiAgICAgIGlmIChsYXN0ICYmIGxhc3QubmFtZSA9PT0gc3RyLnNwbGl0KC9cXHMrLylbMF0ucmVwbGFjZSgvXmVuZC8sICcnKSAmJiBsYXN0LmVuZHMpIHtcbiAgICAgICAgc3dpdGNoIChsYXN0Lm5hbWUpIHtcbiAgICAgICAgY2FzZSAnYXV0b2VzY2FwZSc6XG4gICAgICAgICAgZXNjYXBlID0gb3B0cy5hdXRvZXNjYXBlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyYXcnOlxuICAgICAgICAgIGluUmF3ID0gZmFsc2U7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFpblJhdykge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGVuZCBvZiB0YWcgXCInICsgc3RyLnJlcGxhY2UoL15lbmQvLCAnJykgKyAnXCInLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaW5SYXcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjaHVua3MgPSBzdHIuc3BsaXQoL1xccysoLispPy8pO1xuICAgIHRhZ05hbWUgPSBjaHVua3Muc2hpZnQoKTtcblxuICAgIGlmICghdGFncy5oYXNPd25Qcm9wZXJ0eSh0YWdOYW1lKSkge1xuICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCB0YWcgXCInICsgc3RyICsgJ1wiJywgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgfVxuXG4gICAgdG9rZW5zID0gbGV4ZXIucmVhZCh1dGlscy5zdHJpcChjaHVua3Muam9pbignICcpKSk7XG4gICAgcGFyc2VyID0gbmV3IFRva2VuUGFyc2VyKHRva2VucywgZmlsdGVycywgZmFsc2UsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgIHRhZyA9IHRhZ3NbdGFnTmFtZV07XG5cbiAgICAvKipcbiAgICAgKiBEZWZpbmUgY3VzdG9tIHBhcnNpbmcgbWV0aG9kcyBmb3IgeW91ciB0YWcuXG4gICAgICogQGNhbGxiYWNrIHBhcnNlXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBvcHRpb25zKSB7XG4gICAgICogICBwYXJzZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICAvLyAuLi5cbiAgICAgKiAgIH0pO1xuICAgICAqICAgcGFyc2VyLm9uKHR5cGVzLlNUUklORywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICogICAgIC8vIC4uLlxuICAgICAqICAgfSk7XG4gICAgICogfTtcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgVGhlIGZ1bGwgdG9rZW4gc3RyaW5nIG9mIHRoZSB0YWcuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyIHRoYXQgdGhpcyB0YWcgYXBwZWFycyBvbi5cbiAgICAgKiBAcGFyYW0ge1Rva2VuUGFyc2VyfSBwYXJzZXIgQSBUb2tlblBhcnNlciBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0ge1RZUEVTfSB0eXBlcyBMZXhlciB0b2tlbiB0eXBlIGVudW0uXG4gICAgICogQHBhcmFtIHtUYWdUb2tlbltdfSBzdGFjayBUaGUgY3VycmVudCBzdGFjayBvZiBvcGVuIHRhZ3MuXG4gICAgICogQHBhcmFtIHtTd2lnT3B0c30gb3B0aW9ucyBTd2lnIE9wdGlvbnMgT2JqZWN0LlxuICAgICAqL1xuICAgIGlmICghdGFnLnBhcnNlKGNodW5rc1sxXSwgbGluZSwgcGFyc2VyLCBfdCwgc3RhY2ssIG9wdHMpKSB7XG4gICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIHRhZyBcIicgKyB0YWdOYW1lICsgJ1wiJywgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgfVxuXG4gICAgcGFyc2VyLnBhcnNlKCk7XG4gICAgYXJncyA9IHBhcnNlci5vdXQ7XG5cbiAgICBzd2l0Y2ggKHRhZ05hbWUpIHtcbiAgICBjYXNlICdhdXRvZXNjYXBlJzpcbiAgICAgIGVzY2FwZSA9IChhcmdzWzBdICE9PSAnZmFsc2UnKSA/IGFyZ3NbMF0gOiBmYWxzZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICBpblJhdyA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIHBhcnNlZCB0YWcgdG9rZW4uXG4gICAgICogQHR5cGVkZWYge09iamVjdH0gVGFnVG9rZW5cbiAgICAgKiBAcHJvcGVydHkge2NvbXBpbGV9IFtjb21waWxlXSBNZXRob2QgZm9yIGNvbXBpbGluZyB0aGlzIHRva2VuLlxuICAgICAqIEBwcm9wZXJ0eSB7YXJyYXl9IFthcmdzXSBBcnJheSBvZiBhcmd1bWVudHMgZm9yIHRoZSB0YWcuXG4gICAgICogQHByb3BlcnR5IHtUb2tlbltdfSBbY29udGVudD1bXV0gQW4gYXJyYXkgb2YgdG9rZW5zIHRoYXQgYXJlIGNoaWxkcmVuIG9mIHRoaXMgVG9rZW4uXG4gICAgICogQHByb3BlcnR5IHtib29sZWFufSBbZW5kc10gV2hldGhlciBvciBub3QgdGhpcyB0YWcgcmVxdWlyZXMgYW4gZW5kIHRhZy5cbiAgICAgKiBAcHJvcGVydHkge3N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGlzIHRhZy5cbiAgICAgKi9cbiAgICByZXR1cm4ge1xuICAgICAgYmxvY2s6ICEhdGFnc1t0YWdOYW1lXS5ibG9jayxcbiAgICAgIGNvbXBpbGU6IHRhZy5jb21waWxlLFxuICAgICAgYXJnczogYXJncyxcbiAgICAgIGNvbnRlbnQ6IFtdLFxuICAgICAgZW5kczogdGFnLmVuZHMsXG4gICAgICBuYW1lOiB0YWdOYW1lXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJpcCB0aGUgd2hpdGVzcGFjZSBmcm9tIHRoZSBwcmV2aW91cyB0b2tlbiwgaWYgaXQgaXMgYSBzdHJpbmcuXG4gICAqIEBwYXJhbSAge29iamVjdH0gdG9rZW4gUGFyc2VkIHRva2VuLlxuICAgKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgIElmIHRoZSB0b2tlbiB3YXMgYSBzdHJpbmcsIHRyYWlsaW5nIHdoaXRlc3BhY2Ugd2lsbCBiZSBzdHJpcHBlZC5cbiAgICovXG4gIGZ1bmN0aW9uIHN0cmlwUHJldlRva2VuKHRva2VuKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRva2VuID0gdG9rZW4ucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG4gICAgfVxuICAgIHJldHVybiB0b2tlbjtcbiAgfVxuXG4gIC8qIVxuICAgKiBMb29wIG92ZXIgdGhlIHNvdXJjZSwgc3BsaXQgdmlhIHRoZSB0YWcvdmFyL2NvbW1lbnQgcmVndWxhciBleHByZXNzaW9uIHNwbGl0dGVyLlxuICAgKiBTZW5kIGVhY2ggY2h1bmsgdG8gdGhlIGFwcHJvcHJpYXRlIHBhcnNlci5cbiAgICovXG4gIHV0aWxzLmVhY2goc291cmNlLnNwbGl0KHNwbGl0dGVyKSwgZnVuY3Rpb24gKGNodW5rKSB7XG4gICAgdmFyIHRva2VuLCBsaW5lcywgc3RyaXBQcmV2LCBwcmV2VG9rZW4sIHByZXZDaGlsZFRva2VuO1xuXG4gICAgaWYgKCFjaHVuaykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElzIGEgdmFyaWFibGU/XG4gICAgaWYgKCFpblJhdyAmJiB1dGlscy5zdGFydHNXaXRoKGNodW5rLCB2YXJPcGVuKSAmJiB1dGlscy5lbmRzV2l0aChjaHVuaywgdmFyQ2xvc2UpKSB7XG4gICAgICBzdHJpcFByZXYgPSB2YXJTdHJpcEJlZm9yZS50ZXN0KGNodW5rKTtcbiAgICAgIHN0cmlwTmV4dCA9IHZhclN0cmlwQWZ0ZXIudGVzdChjaHVuayk7XG4gICAgICB0b2tlbiA9IHBhcnNlVmFyaWFibGUoY2h1bmsucmVwbGFjZSh2YXJTdHJpcCwgJycpLCBsaW5lKTtcbiAgICAvLyBJcyBhIHRhZz9cbiAgICB9IGVsc2UgaWYgKHV0aWxzLnN0YXJ0c1dpdGgoY2h1bmssIHRhZ09wZW4pICYmIHV0aWxzLmVuZHNXaXRoKGNodW5rLCB0YWdDbG9zZSkpIHtcbiAgICAgIHN0cmlwUHJldiA9IHRhZ1N0cmlwQmVmb3JlLnRlc3QoY2h1bmspO1xuICAgICAgc3RyaXBOZXh0ID0gdGFnU3RyaXBBZnRlci50ZXN0KGNodW5rKTtcbiAgICAgIHRva2VuID0gcGFyc2VUYWcoY2h1bmsucmVwbGFjZSh0YWdTdHJpcCwgJycpLCBsaW5lKTtcbiAgICAgIGlmICh0b2tlbikge1xuICAgICAgICBpZiAodG9rZW4ubmFtZSA9PT0gJ2V4dGVuZHMnKSB7XG4gICAgICAgICAgcGFyZW50ID0gdG9rZW4uYXJncy5qb2luKCcnKS5yZXBsYWNlKC9eXFwnfFxcJyQvZywgJycpLnJlcGxhY2UoL15cXFwifFxcXCIkL2csICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0b2tlbi5ibG9jayAmJiAoIXN0YWNrLmxlbmd0aCB8fCB0b2tlbi5uYW1lID09PSAnYmxvY2snKSkge1xuICAgICAgICAgIGJsb2Nrc1t0b2tlbi5hcmdzLmpvaW4oJycpXSA9IHRva2VuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaW5SYXcgJiYgIXRva2VuKSB7XG4gICAgICAgIHRva2VuID0gY2h1bms7XG4gICAgICB9XG4gICAgLy8gSXMgYSBjb250ZW50IHN0cmluZz9cbiAgICB9IGVsc2UgaWYgKGluUmF3IHx8ICghdXRpbHMuc3RhcnRzV2l0aChjaHVuaywgY210T3BlbikgJiYgIXV0aWxzLmVuZHNXaXRoKGNodW5rLCBjbXRDbG9zZSkpKSB7XG4gICAgICB0b2tlbiA9IChzdHJpcE5leHQpID8gY2h1bmsucmVwbGFjZSgvXlxccyovLCAnJykgOiBjaHVuaztcbiAgICAgIHN0cmlwTmV4dCA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAodXRpbHMuc3RhcnRzV2l0aChjaHVuaywgY210T3BlbikgJiYgdXRpbHMuZW5kc1dpdGgoY2h1bmssIGNtdENsb3NlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIERpZCB0aGlzIHRhZyBhc2sgdG8gc3RyaXAgcHJldmlvdXMgd2hpdGVzcGFjZT8gPGNvZGU+eyUtIC4uLiAlfTwvY29kZT4gb3IgPGNvZGU+e3stIC4uLiB9fTwvY29kZT5cbiAgICBpZiAoc3RyaXBQcmV2ICYmIHRva2Vucy5sZW5ndGgpIHtcbiAgICAgIHByZXZUb2tlbiA9IHRva2Vucy5wb3AoKTtcbiAgICAgIGlmICh0eXBlb2YgcHJldlRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgICBwcmV2VG9rZW4gPSBzdHJpcFByZXZUb2tlbihwcmV2VG9rZW4pO1xuICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4uY29udGVudCAmJiBwcmV2VG9rZW4uY29udGVudC5sZW5ndGgpIHtcbiAgICAgICAgcHJldkNoaWxkVG9rZW4gPSBzdHJpcFByZXZUb2tlbihwcmV2VG9rZW4uY29udGVudC5wb3AoKSk7XG4gICAgICAgIHByZXZUb2tlbi5jb250ZW50LnB1c2gocHJldkNoaWxkVG9rZW4pO1xuICAgICAgfVxuICAgICAgdG9rZW5zLnB1c2gocHJldlRva2VuKTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIHdhcyBhIGNvbW1lbnQsIHNvIGxldCdzIGp1c3Qga2VlcCBnb2luZy5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlcmUncyBhbiBvcGVuIGl0ZW0gaW4gdGhlIHN0YWNrLCBhZGQgdGhpcyB0byBpdHMgY29udGVudC5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICBzdGFja1tzdGFjay5sZW5ndGggLSAxXS5jb250ZW50LnB1c2godG9rZW4pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlIHRva2VuIGlzIGEgdGFnIHRoYXQgcmVxdWlyZXMgYW4gZW5kIHRhZywgb3BlbiBpdCBvbiB0aGUgc3RhY2suXG4gICAgaWYgKHRva2VuLm5hbWUgJiYgdG9rZW4uZW5kcykge1xuICAgICAgc3RhY2sucHVzaCh0b2tlbik7XG4gICAgfVxuXG4gICAgbGluZXMgPSBjaHVuay5tYXRjaCgvXFxuL2cpO1xuICAgIGxpbmUgKz0gKGxpbmVzKSA/IGxpbmVzLmxlbmd0aCA6IDA7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgbmFtZTogb3B0cy5maWxlbmFtZSxcbiAgICBwYXJlbnQ6IHBhcmVudCxcbiAgICB0b2tlbnM6IHRva2VucyxcbiAgICBibG9ja3M6IGJsb2Nrc1xuICB9O1xufTtcblxuXG4vKipcbiAqIENvbXBpbGUgYW4gYXJyYXkgb2YgdG9rZW5zLlxuICogQHBhcmFtICB7VG9rZW5bXX0gdGVtcGxhdGUgICAgIEFuIGFycmF5IG9mIHRlbXBsYXRlIHRva2Vucy5cbiAqIEBwYXJhbSAge1RlbXBsYXRlc1tdfSBwYXJlbnRzICBBcnJheSBvZiBwYXJlbnQgdGVtcGxhdGVzLlxuICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zXSAgIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IFtibG9ja05hbWVdICAgTmFtZSBvZiB0aGUgY3VycmVudCBibG9jayBjb250ZXh0LlxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICAgIFBhcnRpYWwgZm9yIGEgY29tcGlsZWQgSmF2YVNjcmlwdCBtZXRob2QgdGhhdCB3aWxsIG91dHB1dCBhIHJlbmRlcmVkIHRlbXBsYXRlLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAodGVtcGxhdGUsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICB2YXIgb3V0ID0gJycsXG4gICAgdG9rZW5zID0gdXRpbHMuaXNBcnJheSh0ZW1wbGF0ZSkgPyB0ZW1wbGF0ZSA6IHRlbXBsYXRlLnRva2VucztcblxuICB1dGlscy5lYWNoKHRva2VucywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIG87XG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG91dCArPSAnX291dHB1dCArPSBcIicgKyB0b2tlbi5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1xcbnxcXHIvZywgJ1xcXFxuJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpICsgJ1wiO1xcbic7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcGlsZSBjYWxsYmFjayBmb3IgVmFyVG9rZW4gYW5kIFRhZ1Rva2VuIG9iamVjdHMuXG4gICAgICogQGNhbGxiYWNrIGNvbXBpbGVcbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgICAgKiAgIGlmIChhcmdzWzBdID09PSAnZm9vJykge1xuICAgICAqICAgICByZXR1cm4gY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSArICdcXG4nO1xuICAgICAqICAgfVxuICAgICAqICAgcmV0dXJuICdfb3V0cHV0ICs9IFwiZmFsbGJhY2tcIjtcXG4nO1xuICAgICAqIH07XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3BhcnNlckNvbXBpbGVyfSBjb21waWxlclxuICAgICAqIEBwYXJhbSB7YXJyYXl9IFthcmdzXSBBcnJheSBvZiBwYXJzZWQgYXJndW1lbnRzIG9uIHRoZSBmb3IgdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7YXJyYXl9IFtjb250ZW50XSBBcnJheSBvZiBjb250ZW50IHdpdGhpbiB0aGUgdG9rZW4uXG4gICAgICogQHBhcmFtIHthcnJheX0gW3BhcmVudHNdIEFycmF5IG9mIHBhcmVudCB0ZW1wbGF0ZXMgZm9yIHRoZSBjdXJyZW50IHRlbXBsYXRlIGNvbnRleHQuXG4gICAgICogQHBhcmFtIHtTd2lnT3B0c30gW29wdGlvbnNdIFN3aWcgT3B0aW9ucyBPYmplY3RcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW2Jsb2NrTmFtZV0gTmFtZSBvZiB0aGUgZGlyZWN0IGJsb2NrIHBhcmVudCwgaWYgYW55LlxuICAgICAqL1xuICAgIG8gPSB0b2tlbi5jb21waWxlKGV4cG9ydHMuY29tcGlsZSwgdG9rZW4uYXJncyA/IHRva2VuLmFyZ3Muc2xpY2UoMCkgOiBbXSwgdG9rZW4uY29udGVudCA/IHRva2VuLmNvbnRlbnQuc2xpY2UoMCkgOiBbXSwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKTtcbiAgICBvdXQgKz0gbyB8fCAnJztcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3BhcnNlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKSxcbiAgX3RhZ3MgPSByZXF1aXJlKCcuL3RhZ3MnKSxcbiAgX2ZpbHRlcnMgPSByZXF1aXJlKCcuL2ZpbHRlcnMnKSxcbiAgcGFyc2VyID0gcmVxdWlyZSgnLi9wYXJzZXInKSxcbiAgZGF0ZWZvcm1hdHRlciA9IHJlcXVpcmUoJy4vZGF0ZWZvcm1hdHRlcicpLFxuICBsb2FkZXJzID0gcmVxdWlyZSgnLi9sb2FkZXJzJyk7XG5cbi8qKlxuICogU3dpZyB2ZXJzaW9uIG51bWJlciBhcyBhIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKiBpZiAoc3dpZy52ZXJzaW9uID09PSBcIjEuMy4yXCIpIHsgLi4uIH1cbiAqXG4gKiBAdHlwZSB7U3RyaW5nfVxuICovXG5leHBvcnRzLnZlcnNpb24gPSBcIjEuMy4yXCI7XG5cbi8qKlxuICogU3dpZyBPcHRpb25zIE9iamVjdC4gVGhpcyBvYmplY3QgY2FuIGJlIHBhc3NlZCB0byBtYW55IG9mIHRoZSBBUEktbGV2ZWwgU3dpZyBtZXRob2RzIHRvIGNvbnRyb2wgdmFyaW91cyBhc3BlY3RzIG9mIHRoZSBlbmdpbmUuIEFsbCBrZXlzIGFyZSBvcHRpb25hbC5cbiAqIEB0eXBlZGVmIHtPYmplY3R9IFN3aWdPcHRzXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGF1dG9lc2NhcGUgIENvbnRyb2xzIHdoZXRoZXIgb3Igbm90IHZhcmlhYmxlIG91dHB1dCB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgZXNjYXBlZCBmb3Igc2FmZSBIVE1MIG91dHB1dC4gRGVmYXVsdHMgdG8gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+dHJ1ZTwvY29kZT4uIEZ1bmN0aW9ucyBleGVjdXRlZCBpbiB2YXJpYWJsZSBzdGF0ZW1lbnRzIHdpbGwgbm90IGJlIGF1dG8tZXNjYXBlZC4gWW91ciBhcHBsaWNhdGlvbi9mdW5jdGlvbnMgc2hvdWxkIHRha2UgY2FyZSBvZiB0aGVpciBvd24gYXV0by1lc2NhcGluZy5cbiAqIEBwcm9wZXJ0eSB7YXJyYXl9ICAgdmFyQ29udHJvbHMgT3BlbiBhbmQgY2xvc2UgY29udHJvbHMgZm9yIHZhcmlhYmxlcy4gRGVmYXVsdHMgdG8gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+Wyd7eycsICd9fSddPC9jb2RlPi5cbiAqIEBwcm9wZXJ0eSB7YXJyYXl9ICAgdGFnQ29udHJvbHMgT3BlbiBhbmQgY2xvc2UgY29udHJvbHMgZm9yIHRhZ3MuIERlZmF1bHRzIHRvIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPlsneyUnLCAnJX0nXTwvY29kZT4uXG4gKiBAcHJvcGVydHkge2FycmF5fSAgIGNtdENvbnRyb2xzIE9wZW4gYW5kIGNsb3NlIGNvbnRyb2xzIGZvciBjb21tZW50cy4gRGVmYXVsdHMgdG8gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+Wyd7IycsICcjfSddPC9jb2RlPi5cbiAqIEBwcm9wZXJ0eSB7b2JqZWN0fSAgbG9jYWxzICAgICAgRGVmYXVsdCB2YXJpYWJsZSBjb250ZXh0IHRvIGJlIHBhc3NlZCB0byA8c3Ryb25nPmFsbDwvc3Ryb25nPiB0ZW1wbGF0ZXMuXG4gKiBAcHJvcGVydHkge0NhY2hlT3B0aW9uc30gY2FjaGUgQ2FjaGUgY29udHJvbCBmb3IgdGVtcGxhdGVzLiBEZWZhdWx0cyB0byBzYXZpbmcgaW4gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+J21lbW9yeSc8L2NvZGU+LiBTZW5kIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPmZhbHNlPC9jb2RlPiB0byBkaXNhYmxlLiBTZW5kIGFuIG9iamVjdCB3aXRoIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPmdldDwvY29kZT4gYW5kIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPnNldDwvY29kZT4gZnVuY3Rpb25zIHRvIGN1c3RvbWl6ZS5cbiAqIEBwcm9wZXJ0eSB7VGVtcGxhdGVMb2FkZXJ9IGxvYWRlciBUaGUgbWV0aG9kIHRoYXQgU3dpZyB3aWxsIHVzZSB0byBsb2FkIHRlbXBsYXRlcy4gRGVmYXVsdHMgdG8gPHZhcj5zd2lnLmxvYWRlcnMuZnM8L3Zhcj4uXG4gKi9cbnZhciBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICBhdXRvZXNjYXBlOiB0cnVlLFxuICAgIHZhckNvbnRyb2xzOiBbJ3t7JywgJ319J10sXG4gICAgdGFnQ29udHJvbHM6IFsneyUnLCAnJX0nXSxcbiAgICBjbXRDb250cm9sczogWyd7IycsICcjfSddLFxuICAgIGxvY2Fsczoge30sXG4gICAgLyoqXG4gICAgICogQ2FjaGUgY29udHJvbCBmb3IgdGVtcGxhdGVzLiBEZWZhdWx0cyB0byBzYXZpbmcgYWxsIHRlbXBsYXRlcyBpbnRvIG1lbW9yeS5cbiAgICAgKiBAdHlwZWRlZiB7Ym9vbGVhbnxzdHJpbmd8b2JqZWN0fSBDYWNoZU9wdGlvbnNcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIERlZmF1bHRcbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHsgY2FjaGU6ICdtZW1vcnknIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRGlzYWJsZXMgY2FjaGluZyBpbiBTd2lnLlxuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoeyBjYWNoZTogZmFsc2UgfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDdXN0b20gY2FjaGUgc3RvcmFnZSBhbmQgcmV0cmlldmFsXG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7XG4gICAgICogICBjYWNoZToge1xuICAgICAqICAgICBnZXQ6IGZ1bmN0aW9uIChrZXkpIHsgLi4uIH0sXG4gICAgICogICAgIHNldDogZnVuY3Rpb24gKGtleSwgdmFsKSB7IC4uLiB9XG4gICAgICogICB9XG4gICAgICogfSk7XG4gICAgICovXG4gICAgY2FjaGU6ICdtZW1vcnknLFxuICAgIC8qKlxuICAgICAqIENvbmZpZ3VyZSBTd2lnIHRvIHVzZSBlaXRoZXIgdGhlIDx2YXI+c3dpZy5sb2FkZXJzLmZzPC92YXI+IG9yIDx2YXI+c3dpZy5sb2FkZXJzLm1lbW9yeTwvdmFyPiB0ZW1wbGF0ZSBsb2FkZXIuIE9yLCB5b3UgY2FuIHdyaXRlIHlvdXIgb3duIVxuICAgICAqIEZvciBtb3JlIGluZm9ybWF0aW9uLCBwbGVhc2Ugc2VlIHRoZSA8YSBocmVmPVwiLi4vbG9hZGVycy9cIj5UZW1wbGF0ZSBMb2FkZXJzIGRvY3VtZW50YXRpb248L2E+LlxuICAgICAqIEB0eXBlZGVmIHtjbGFzc30gVGVtcGxhdGVMb2FkZXJcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIERlZmF1bHQsIEZpbGVTeXN0ZW0gbG9hZGVyXG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLmZzKCkgfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBGaWxlU3lzdGVtIGxvYWRlciBhbGxvd2luZyBhIGJhc2UgcGF0aFxuICAgICAqIC8vIFdpdGggdGhpcywgeW91IGRvbid0IHVzZSByZWxhdGl2ZSBVUkxzIGluIHlvdXIgdGVtcGxhdGUgcmVmZXJlbmNlc1xuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5mcyhfX2Rpcm5hbWUgKyAnL3RlbXBsYXRlcycpIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gTWVtb3J5IExvYWRlclxuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5tZW1vcnkoe1xuICAgICAqICAgbGF5b3V0OiAneyUgYmxvY2sgZm9vICV9eyUgZW5kYmxvY2sgJX0nLFxuICAgICAqICAgcGFnZTE6ICd7JSBleHRlbmRzIFwibGF5b3V0XCIgJX17JSBibG9jayBmb28gJX1UYWNvcyF7JSBlbmRibG9jayAlfSdcbiAgICAgKiB9KX0pO1xuICAgICAqL1xuICAgIGxvYWRlcjogbG9hZGVycy5mcygpXG4gIH0sXG4gIGRlZmF1bHRJbnN0YW5jZTtcblxuLyoqXG4gKiBFbXB0eSBmdW5jdGlvbiwgdXNlZCBpbiB0ZW1wbGF0ZXMuXG4gKiBAcmV0dXJuIHtzdHJpbmd9IEVtcHR5IHN0cmluZ1xuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gZWZuKCkgeyByZXR1cm4gJyc7IH1cblxuLyoqXG4gKiBWYWxpZGF0ZSB0aGUgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSAgez9Td2lnT3B0c30gb3B0aW9ucyBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHJldHVybiB7dW5kZWZpbmVkfSAgICAgIFRoaXMgbWV0aG9kIHdpbGwgdGhyb3cgZXJyb3JzIGlmIGFueXRoaW5nIGlzIHdyb25nLlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gdmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpIHtcbiAgaWYgKCFvcHRpb25zKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdXRpbHMuZWFjaChbJ3ZhckNvbnRyb2xzJywgJ3RhZ0NvbnRyb2xzJywgJ2NtdENvbnRyb2xzJ10sIGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXV0aWxzLmlzQXJyYXkob3B0aW9uc1trZXldKSB8fCBvcHRpb25zW2tleV0ubGVuZ3RoICE9PSAyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09wdGlvbiBcIicgKyBrZXkgKyAnXCIgbXVzdCBiZSBhbiBhcnJheSBjb250YWluaW5nIDIgZGlmZmVyZW50IGNvbnRyb2wgc3RyaW5ncy4nKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnNba2V5XVswXSA9PT0gb3B0aW9uc1trZXldWzFdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09wdGlvbiBcIicgKyBrZXkgKyAnXCIgb3BlbiBhbmQgY2xvc2UgY29udHJvbHMgbXVzdCBub3QgYmUgdGhlIHNhbWUuJyk7XG4gICAgfVxuICAgIHV0aWxzLmVhY2gob3B0aW9uc1trZXldLCBmdW5jdGlvbiAoYSwgaSkge1xuICAgICAgaWYgKGEubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ09wdGlvbiBcIicgKyBrZXkgKyAnXCIgJyArICgoaSkgPyAnb3BlbiAnIDogJ2Nsb3NlICcpICsgJ2NvbnRyb2wgbXVzdCBiZSBhdCBsZWFzdCAyIGNoYXJhY3RlcnMuIFNhdyBcIicgKyBhICsgJ1wiIGluc3RlYWQuJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KCdjYWNoZScpKSB7XG4gICAgaWYgKG9wdGlvbnMuY2FjaGUgJiYgb3B0aW9ucy5jYWNoZSAhPT0gJ21lbW9yeScpIHtcbiAgICAgIGlmICghb3B0aW9ucy5jYWNoZS5nZXQgfHwgIW9wdGlvbnMuY2FjaGUuc2V0KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjYWNoZSBvcHRpb24gJyArIEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuY2FjaGUpICsgJyBmb3VuZC4gRXhwZWN0ZWQgXCJtZW1vcnlcIiBvciB7IGdldDogZnVuY3Rpb24gKGtleSkgeyAuLi4gfSwgc2V0OiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkgeyAuLi4gfSB9LicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnbG9hZGVyJykpIHtcbiAgICBpZiAob3B0aW9ucy5sb2FkZXIpIHtcbiAgICAgIGlmICghb3B0aW9ucy5sb2FkZXIubG9hZCB8fCAhb3B0aW9ucy5sb2FkZXIucmVzb2x2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9hZGVyIG9wdGlvbiAnICsgSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5sb2FkZXIpICsgJyBmb3VuZC4gRXhwZWN0ZWQgeyBsb2FkOiBmdW5jdGlvbiAocGF0aG5hbWUsIGNiKSB7IC4uLiB9LCByZXNvbHZlOiBmdW5jdGlvbiAodG8sIGZyb20pIHsgLi4uIH0gfS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxufVxuXG4vKipcbiAqIFNldCBkZWZhdWx0cyBmb3IgdGhlIGJhc2UgYW5kIGFsbCBuZXcgU3dpZyBlbnZpcm9ubWVudHMuXG4gKlxuICogQGV4YW1wbGVcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBjYWNoZTogZmFsc2UgfSk7XG4gKiAvLyA9PiBEaXNhYmxlcyBDYWNoZVxuICpcbiAqIEBleGFtcGxlXG4gKiBzd2lnLnNldERlZmF1bHRzKHsgbG9jYWxzOiB7IG5vdzogZnVuY3Rpb24gKCkgeyByZXR1cm4gbmV3IERhdGUoKTsgfSB9fSk7XG4gKiAvLyA9PiBzZXRzIGEgZ2xvYmFsbHkgYWNjZXNzaWJsZSBtZXRob2QgZm9yIGFsbCB0ZW1wbGF0ZVxuICogLy8gICAgY29udGV4dHMsIGFsbG93aW5nIHlvdSB0byBwcmludCB0aGUgY3VycmVudCBkYXRlXG4gKiAvLyA9PiB7eyBub3coKXxkYXRlKCdGIGpTLCBZJykgfX1cbiAqXG4gKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gKi9cbmV4cG9ydHMuc2V0RGVmYXVsdHMgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICB2YWxpZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cbiAgdmFyIGxvY2FscyA9IHV0aWxzLmV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMubG9jYWxzLCBvcHRpb25zLmxvY2FscyB8fCB7fSk7XG5cbiAgdXRpbHMuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcbiAgZGVmYXVsdE9wdGlvbnMubG9jYWxzID0gbG9jYWxzO1xuXG4gIGRlZmF1bHRJbnN0YW5jZS5vcHRpb25zID0gdXRpbHMuZXh0ZW5kKGRlZmF1bHRJbnN0YW5jZS5vcHRpb25zLCBvcHRpb25zKTtcbn07XG5cbi8qKlxuICogU2V0IHRoZSBkZWZhdWx0IFRpbWVab25lIG9mZnNldCBmb3IgZGF0ZSBmb3JtYXR0aW5nIHZpYSB0aGUgZGF0ZSBmaWx0ZXIuIFRoaXMgaXMgYSBnbG9iYWwgc2V0dGluZyBhbmQgd2lsbCBhZmZlY3QgYWxsIFN3aWcgZW52aXJvbm1lbnRzLCBvbGQgb3IgbmV3LlxuICogQHBhcmFtICB7bnVtYmVyfSBvZmZzZXQgT2Zmc2V0IGZyb20gR01ULCBpbiBtaW51dGVzLlxuICogQHJldHVybiB7dW5kZWZpbmVkfVxuICovXG5leHBvcnRzLnNldERlZmF1bHRUWk9mZnNldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgZGF0ZWZvcm1hdHRlci50ek9mZnNldCA9IG9mZnNldDtcbn07XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3LCBzZXBhcmF0ZSBTd2lnIGNvbXBpbGUvcmVuZGVyIGVudmlyb25tZW50LlxuICpcbiAqIEBleGFtcGxlXG4gKiB2YXIgc3dpZyA9IHJlcXVpcmUoJ3N3aWcnKTtcbiAqIHZhciBteXN3aWcgPSBuZXcgc3dpZy5Td2lnKHt2YXJDb250cm9sczogWyc8JT0nLCAnJT4nXX0pO1xuICogbXlzd2lnLnJlbmRlcignVGFjb3MgYXJlIDwlPSB0YWNvcyA9PiEnLCB7IGxvY2FsczogeyB0YWNvczogJ2RlbGljaW91cycgfX0pO1xuICogLy8gPT4gVGFjb3MgYXJlIGRlbGljaW91cyFcbiAqIHN3aWcucmVuZGVyKCdUYWNvcyBhcmUgPCU9IHRhY29zID0+IScsIHsgbG9jYWxzOiB7IHRhY29zOiAnZGVsaWNpb3VzJyB9fSk7XG4gKiAvLyA9PiAnVGFjb3MgYXJlIDwlPSB0YWNvcyA9PiEnXG4gKlxuICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRzPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHJldHVybiB7b2JqZWN0fSAgICAgIE5ldyBTd2lnIGVudmlyb25tZW50LlxuICovXG5leHBvcnRzLlN3aWcgPSBmdW5jdGlvbiAob3B0cykge1xuICB2YWxpZGF0ZU9wdGlvbnMob3B0cyk7XG4gIHRoaXMub3B0aW9ucyA9IHV0aWxzLmV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdHMgfHwge30pO1xuICB0aGlzLmNhY2hlID0ge307XG4gIHRoaXMuZXh0ZW5zaW9ucyA9IHt9O1xuICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgdGFncyA9IF90YWdzLFxuICAgIGZpbHRlcnMgPSBfZmlsdGVycztcblxuICAvKipcbiAgICogR2V0IGNvbWJpbmVkIGxvY2FscyBjb250ZXh0LlxuICAgKiBAcGFyYW0gIHs/U3dpZ09wdHN9IFtvcHRpb25zXSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgICAgTG9jYWxzIGNvbnRleHQuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBnZXRMb2NhbHMob3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucyB8fCAhb3B0aW9ucy5sb2NhbHMpIHtcbiAgICAgIHJldHVybiBzZWxmLm9wdGlvbnMubG9jYWxzO1xuICAgIH1cblxuICAgIHJldHVybiB1dGlscy5leHRlbmQoe30sIHNlbGYub3B0aW9ucy5sb2NhbHMsIG9wdGlvbnMubG9jYWxzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY29tcGlsZWQgdGVtcGxhdGUgZnJvbSB0aGUgY2FjaGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ30ga2V5ICAgICAgICAgICBOYW1lIG9mIHRlbXBsYXRlLlxuICAgKiBAcmV0dXJuIHtvYmplY3R8dW5kZWZpbmVkfSAgICAgVGVtcGxhdGUgZnVuY3Rpb24gYW5kIHRva2Vucy5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIGNhY2hlR2V0KGtleSkge1xuICAgIGlmICghc2VsZi5vcHRpb25zLmNhY2hlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNlbGYub3B0aW9ucy5jYWNoZSA9PT0gJ21lbW9yeScpIHtcbiAgICAgIHJldHVybiBzZWxmLmNhY2hlW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGYub3B0aW9ucy5jYWNoZS5nZXQoa2V5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9yZSBhIHRlbXBsYXRlIGluIHRoZSBjYWNoZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBrZXkgTmFtZSBvZiB0ZW1wbGF0ZS5cbiAgICogQHBhcmFtICB7b2JqZWN0fSB2YWwgVGVtcGxhdGUgZnVuY3Rpb24gYW5kIHRva2Vucy5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gY2FjaGVTZXQoa2V5LCB2YWwpIHtcbiAgICBpZiAoIXNlbGYub3B0aW9ucy5jYWNoZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzZWxmLm9wdGlvbnMuY2FjaGUgPT09ICdtZW1vcnknKSB7XG4gICAgICBzZWxmLmNhY2hlW2tleV0gPSB2YWw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2VsZi5vcHRpb25zLmNhY2hlLnNldChrZXksIHZhbCk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIHRoZSBpbi1tZW1vcnkgdGVtcGxhdGUgY2FjaGUuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcuaW52YWxpZGF0ZUNhY2hlKCk7XG4gICAqXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICovXG4gIHRoaXMuaW52YWxpZGF0ZUNhY2hlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmIChzZWxmLm9wdGlvbnMuY2FjaGUgPT09ICdtZW1vcnknKSB7XG4gICAgICBzZWxmLmNhY2hlID0ge307XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBjdXN0b20gZmlsdGVyIGZvciBzd2lnIHZhcmlhYmxlcy5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogZnVuY3Rpb24gcmVwbGFjZU1zKGlucHV0KSB7IHJldHVybiBpbnB1dC5yZXBsYWNlKC9tL2csICdmJyk7IH1cbiAgICogc3dpZy5zZXRGaWx0ZXIoJ3JlcGxhY2VNcycsIHJlcGxhY2VNcyk7XG4gICAqIC8vID0+IHt7IFwib25vbWF0b3BvZWlhXCJ8cmVwbGFjZU1zIH19XG4gICAqIC8vID0+IG9ub2ZhdG9wZWlhXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSAgICBuYW1lICAgIE5hbWUgb2YgZmlsdGVyLCB1c2VkIGluIHRlbXBsYXRlcy4gPHN0cm9uZz5XaWxsPC9zdHJvbmc+IG92ZXJ3cml0ZSBwcmV2aW91c2x5IGRlZmluZWQgZmlsdGVycywgaWYgdXNpbmcgdGhlIHNhbWUgbmFtZS5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gIG1ldGhvZCAgRnVuY3Rpb24gdGhhdCBhY3RzIGFnYWluc3QgdGhlIGlucHV0LiBTZWUgPGEgaHJlZj1cIi9kb2NzL2ZpbHRlcnMvI2N1c3RvbVwiPkN1c3RvbSBGaWx0ZXJzPC9hPiBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKi9cbiAgdGhpcy5zZXRGaWx0ZXIgPSBmdW5jdGlvbiAobmFtZSwgbWV0aG9kKSB7XG4gICAgaWYgKHR5cGVvZiBtZXRob2QgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGaWx0ZXIgXCInICsgbmFtZSArICdcIiBpcyBub3QgYSB2YWxpZCBmdW5jdGlvbi4nKTtcbiAgICB9XG4gICAgZmlsdGVyc1tuYW1lXSA9IG1ldGhvZDtcbiAgfTtcblxuICAvKipcbiAgICogQWRkIGEgY3VzdG9tIHRhZy4gVG8gZXhwb3NlIHlvdXIgb3duIGV4dGVuc2lvbnMgdG8gY29tcGlsZWQgdGVtcGxhdGUgY29kZSwgc2VlIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPnN3aWcuc2V0RXh0ZW5zaW9uPC9jb2RlPi5cbiAgICpcbiAgICogRm9yIGEgbW9yZSBpbi1kZXB0aCBleHBsYW5hdGlvbiBvZiB3cml0aW5nIGN1c3RvbSB0YWdzLCBzZWUgPGEgaHJlZj1cIi4uL2V4dGVuZGluZy8jdGFnc1wiPkN1c3RvbSBUYWdzPC9hPi5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIHRhY290YWcgPSByZXF1aXJlKCcuL3RhY290YWcnKTtcbiAgICogc3dpZy5zZXRUYWcoJ3RhY29zJywgdGFjb3RhZy5wYXJzZSwgdGFjb3RhZy5jb21waWxlLCB0YWNvdGFnLmVuZHMsIHRhY290YWcuYmxvY2tMZXZlbCk7XG4gICAqIC8vID0+IHslIHRhY29zICV9TWFrZSB0aGlzIGJlIHRhY29zLnslIGVuZHRhY29zICV9XG4gICAqIC8vID0+IFRhY29zIHRhY29zIHRhY29zIHRhY29zLlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IG5hbWUgICAgICBUYWcgbmFtZS5cbiAgICogQHBhcmFtICB7ZnVuY3Rpb259IHBhcnNlICAgTWV0aG9kIGZvciBwYXJzaW5nIHRva2Vucy5cbiAgICogQHBhcmFtICB7ZnVuY3Rpb259IGNvbXBpbGUgTWV0aG9kIGZvciBjb21waWxpbmcgcmVuZGVyYWJsZSBvdXRwdXQuXG4gICAqIEBwYXJhbSAge2Jvb2xlYW59IFtlbmRzPWZhbHNlXSAgICAgV2hldGhlciBvciBub3QgdGhpcyB0YWcgcmVxdWlyZXMgYW4gPGk+ZW5kPC9pPiB0YWcuXG4gICAqIEBwYXJhbSAge2Jvb2xlYW59IFtibG9ja0xldmVsPWZhbHNlXSBJZiBmYWxzZSwgdGhpcyB0YWcgd2lsbCBub3QgYmUgY29tcGlsZWQgb3V0c2lkZSBvZiA8Y29kZT5ibG9jazwvY29kZT4gdGFncyB3aGVuIGV4dGVuZGluZyBhIHBhcmVudCB0ZW1wbGF0ZS5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKi9cbiAgdGhpcy5zZXRUYWcgPSBmdW5jdGlvbiAobmFtZSwgcGFyc2UsIGNvbXBpbGUsIGVuZHMsIGJsb2NrTGV2ZWwpIHtcbiAgICBpZiAodHlwZW9mIHBhcnNlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhZyBcIicgKyBuYW1lICsgJ1wiIHBhcnNlIG1ldGhvZCBpcyBub3QgYSB2YWxpZCBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNvbXBpbGUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGFnIFwiJyArIG5hbWUgKyAnXCIgY29tcGlsZSBtZXRob2QgaXMgbm90IGEgdmFsaWQgZnVuY3Rpb24uJyk7XG4gICAgfVxuXG4gICAgdGFnc1tuYW1lXSA9IHtcbiAgICAgIHBhcnNlOiBwYXJzZSxcbiAgICAgIGNvbXBpbGU6IGNvbXBpbGUsXG4gICAgICBlbmRzOiBlbmRzIHx8IGZhbHNlLFxuICAgICAgYmxvY2s6ICEhYmxvY2tMZXZlbFxuICAgIH07XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCBleHRlbnNpb25zIGZvciBjdXN0b20gdGFncy4gVGhpcyBhbGxvd3MgYW55IGN1c3RvbSB0YWcgdG8gYWNjZXNzIGEgZ2xvYmFsbHkgYXZhaWxhYmxlIG1ldGhvZHMgdmlhIGEgc3BlY2lhbCBnbG9iYWxseSBhdmFpbGFibGUgb2JqZWN0LCA8dmFyPl9leHQ8L3Zhcj4sIGluIHRlbXBsYXRlcy5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5zZXRFeHRlbnNpb24oJ3RyYW5zJywgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHRyYW5zbGF0ZSh2KTsgfSk7XG4gICAqIGZ1bmN0aW9uIGNvbXBpbGVUcmFucyhjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50LCBvcHRpb25zKSB7XG4gICAqICAgcmV0dXJuICdfb3V0cHV0ICs9IF9leHQudHJhbnMoJyArIGFyZ3NbMF0gKyAnKTsnXG4gICAqIH07XG4gICAqIHN3aWcuc2V0VGFnKCd0cmFucycsIHBhcnNlVHJhbnMsIGNvbXBpbGVUcmFucywgdHJ1ZSk7XG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gbmFtZSAgIEtleSBuYW1lIG9mIHRoZSBleHRlbnNpb24uIEFjY2Vzc2VkIHZpYSA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5fZXh0W25hbWVdPC9jb2RlPi5cbiAgICogQHBhcmFtICB7Kn0gICAgICBvYmplY3QgVGhlIG1ldGhvZCwgdmFsdWUsIG9yIG9iamVjdCB0aGF0IHNob3VsZCBiZSBhdmFpbGFibGUgdmlhIHRoZSBnaXZlbiBuYW1lLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqL1xuICB0aGlzLnNldEV4dGVuc2lvbiA9IGZ1bmN0aW9uIChuYW1lLCBvYmplY3QpIHtcbiAgICBzZWxmLmV4dGVuc2lvbnNbbmFtZV0gPSBvYmplY3Q7XG4gIH07XG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgZ2l2ZW4gc291cmNlIHN0cmluZyBpbnRvIHRva2Vucy5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBzb3VyY2UgIFN3aWcgdGVtcGxhdGUgc291cmNlLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge29iamVjdH0gcGFyc2VkICBUZW1wbGF0ZSB0b2tlbnMgb2JqZWN0LlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgdGhpcy5wYXJzZSA9IGZ1bmN0aW9uIChzb3VyY2UsIG9wdGlvbnMpIHtcbiAgICB2YWxpZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cbiAgICB2YXIgbG9jYWxzID0gZ2V0TG9jYWxzKG9wdGlvbnMpLFxuICAgICAgb3B0cyA9IHt9LFxuICAgICAgaztcblxuICAgIGZvciAoayBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShrKSAmJiBrICE9PSAnbG9jYWxzJykge1xuICAgICAgICBvcHRzW2tdID0gb3B0aW9uc1trXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBvcHRpb25zID0gdXRpbHMuZXh0ZW5kKHt9LCBzZWxmLm9wdGlvbnMsIG9wdHMpO1xuICAgIG9wdGlvbnMubG9jYWxzID0gbG9jYWxzO1xuXG4gICAgcmV0dXJuIHBhcnNlci5wYXJzZShzb3VyY2UsIG9wdGlvbnMsIHRhZ3MsIGZpbHRlcnMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBQYXJzZSBhIGdpdmVuIGZpbGUgaW50byB0b2tlbnMuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gcGF0aG5hbWUgIEZ1bGwgcGF0aCB0byBmaWxlIHRvIHBhcnNlLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dICAgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7b2JqZWN0fSBwYXJzZWQgICAgVGVtcGxhdGUgdG9rZW5zIG9iamVjdC5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHRoaXMucGFyc2VGaWxlID0gZnVuY3Rpb24gKHBhdGhuYW1lLCBvcHRpb25zKSB7XG4gICAgdmFyIHNyYztcblxuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IHt9O1xuICAgIH1cblxuICAgIHBhdGhuYW1lID0gc2VsZi5vcHRpb25zLmxvYWRlci5yZXNvbHZlKHBhdGhuYW1lLCBvcHRpb25zLnJlc29sdmVGcm9tKTtcblxuICAgIHNyYyA9IHNlbGYub3B0aW9ucy5sb2FkZXIubG9hZChwYXRobmFtZSk7XG5cbiAgICBpZiAoIW9wdGlvbnMuZmlsZW5hbWUpIHtcbiAgICAgIG9wdGlvbnMgPSB1dGlscy5leHRlbmQoeyBmaWxlbmFtZTogcGF0aG5hbWUgfSwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGYucGFyc2Uoc3JjLCBvcHRpb25zKTtcbiAgfTtcblxuICAvKipcbiAgICogUmUtTWFwIGJsb2NrcyB3aXRoaW4gYSBsaXN0IG9mIHRva2VucyB0byB0aGUgdGVtcGxhdGUncyBibG9jayBvYmplY3RzLlxuICAgKiBAcGFyYW0gIHthcnJheX0gIHRva2VucyAgIExpc3Qgb2YgdG9rZW5zIGZvciB0aGUgcGFyZW50IG9iamVjdC5cbiAgICogQHBhcmFtICB7b2JqZWN0fSB0ZW1wbGF0ZSBDdXJyZW50IHRlbXBsYXRlIHRoYXQgbmVlZHMgdG8gYmUgbWFwcGVkIHRvIHRoZSAgcGFyZW50J3MgYmxvY2sgYW5kIHRva2VuIGxpc3QuXG4gICAqIEByZXR1cm4ge2FycmF5fVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gcmVtYXBCbG9ja3MoYmxvY2tzLCB0b2tlbnMpIHtcbiAgICByZXR1cm4gdXRpbHMubWFwKHRva2VucywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICB2YXIgYXJncyA9IHRva2VuLmFyZ3MgPyB0b2tlbi5hcmdzLmpvaW4oJycpIDogJyc7XG4gICAgICBpZiAodG9rZW4ubmFtZSA9PT0gJ2Jsb2NrJyAmJiBibG9ja3NbYXJnc10pIHtcbiAgICAgICAgdG9rZW4gPSBibG9ja3NbYXJnc107XG4gICAgICB9XG4gICAgICBpZiAodG9rZW4uY29udGVudCAmJiB0b2tlbi5jb250ZW50Lmxlbmd0aCkge1xuICAgICAgICB0b2tlbi5jb250ZW50ID0gcmVtYXBCbG9ja3MoYmxvY2tzLCB0b2tlbi5jb250ZW50KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbXBvcnQgYmxvY2stbGV2ZWwgdGFncyB0byB0aGUgdG9rZW4gbGlzdCB0aGF0IGFyZSBub3QgYWN0dWFsIGJsb2NrIHRhZ3MuXG4gICAqIEBwYXJhbSAge2FycmF5fSBibG9ja3MgTGlzdCBvZiBibG9jay1sZXZlbCB0YWdzLlxuICAgKiBAcGFyYW0gIHthcnJheX0gdG9rZW5zIExpc3Qgb2YgdG9rZW5zIHRvIHJlbmRlci5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gaW1wb3J0Tm9uQmxvY2tzKGJsb2NrcywgdG9rZW5zKSB7XG4gICAgdXRpbHMuZWFjaChibG9ja3MsIGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgaWYgKGJsb2NrLm5hbWUgIT09ICdibG9jaycpIHtcbiAgICAgICAgdG9rZW5zLnVuc2hpZnQoYmxvY2spO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlY3Vyc2l2ZWx5IGNvbXBpbGUgYW5kIGdldCBwYXJlbnRzIG9mIGdpdmVuIHBhcnNlZCB0b2tlbiBvYmplY3QuXG4gICAqXG4gICAqIEBwYXJhbSAge29iamVjdH0gdG9rZW5zICAgIFBhcnNlZCB0b2tlbnMgZnJvbSB0ZW1wbGF0ZS5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSAgIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge29iamVjdH0gICAgICAgICAgIFBhcnNlZCB0b2tlbnMgZnJvbSBwYXJlbnQgdGVtcGxhdGVzLlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0UGFyZW50cyh0b2tlbnMsIG9wdGlvbnMpIHtcbiAgICB2YXIgcGFyZW50TmFtZSA9IHRva2Vucy5wYXJlbnQsXG4gICAgICBwYXJlbnRGaWxlcyA9IFtdLFxuICAgICAgcGFyZW50cyA9IFtdLFxuICAgICAgcGFyZW50RmlsZSxcbiAgICAgIHBhcmVudCxcbiAgICAgIGw7XG5cbiAgICB3aGlsZSAocGFyZW50TmFtZSkge1xuICAgICAgaWYgKCFvcHRpb25zIHx8ICFvcHRpb25zLmZpbGVuYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGV4dGVuZCBcIicgKyBwYXJlbnROYW1lICsgJ1wiIGJlY2F1c2UgY3VycmVudCB0ZW1wbGF0ZSBoYXMgbm8gZmlsZW5hbWUuJyk7XG4gICAgICB9XG5cbiAgICAgIHBhcmVudEZpbGUgPSBwYXJlbnRGaWxlIHx8IG9wdGlvbnMuZmlsZW5hbWU7XG4gICAgICBwYXJlbnRGaWxlID0gc2VsZi5vcHRpb25zLmxvYWRlci5yZXNvbHZlKHBhcmVudE5hbWUsIHBhcmVudEZpbGUpO1xuICAgICAgcGFyZW50ID0gY2FjaGVHZXQocGFyZW50RmlsZSkgfHwgc2VsZi5wYXJzZUZpbGUocGFyZW50RmlsZSwgdXRpbHMuZXh0ZW5kKHt9LCBvcHRpb25zLCB7IGZpbGVuYW1lOiBwYXJlbnRGaWxlIH0pKTtcbiAgICAgIHBhcmVudE5hbWUgPSBwYXJlbnQucGFyZW50O1xuXG4gICAgICBpZiAocGFyZW50RmlsZXMuaW5kZXhPZihwYXJlbnRGaWxlKSAhPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIGNpcmN1bGFyIGV4dGVuZHMgb2YgXCInICsgcGFyZW50RmlsZSArICdcIi4nKTtcbiAgICAgIH1cbiAgICAgIHBhcmVudEZpbGVzLnB1c2gocGFyZW50RmlsZSk7XG5cbiAgICAgIHBhcmVudHMucHVzaChwYXJlbnQpO1xuICAgIH1cblxuICAgIC8vIFJlbWFwIGVhY2ggcGFyZW50cycoMSkgYmxvY2tzIG9udG8gaXRzIG93biBwYXJlbnQoMiksIHJlY2VpdmluZyB0aGUgZnVsbCB0b2tlbiBsaXN0IGZvciByZW5kZXJpbmcgdGhlIG9yaWdpbmFsIHBhcmVudCgxKSBvbiBpdHMgb3duLlxuICAgIGwgPSBwYXJlbnRzLmxlbmd0aDtcbiAgICBmb3IgKGwgPSBwYXJlbnRzLmxlbmd0aCAtIDI7IGwgPj0gMDsgbCAtPSAxKSB7XG4gICAgICBwYXJlbnRzW2xdLnRva2VucyA9IHJlbWFwQmxvY2tzKHBhcmVudHNbbF0uYmxvY2tzLCBwYXJlbnRzW2wgKyAxXS50b2tlbnMpO1xuICAgICAgaW1wb3J0Tm9uQmxvY2tzKHBhcmVudHNbbF0uYmxvY2tzLCBwYXJlbnRzW2xdLnRva2Vucyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmVudHM7XG4gIH1cblxuICAvKipcbiAgICogUHJlLWNvbXBpbGUgYSBzb3VyY2Ugc3RyaW5nIGludG8gYSBjYWNoZS1hYmxlIHRlbXBsYXRlIGZ1bmN0aW9uLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLnByZWNvbXBpbGUoJ3t7IHRhY29zIH19Jyk7XG4gICAqIC8vID0+IHtcbiAgICogLy8gICAgICB0cGw6IGZ1bmN0aW9uIChfc3dpZywgX2xvY2FscywgX2ZpbHRlcnMsIF91dGlscywgX2ZuKSB7IC4uLiB9LFxuICAgKiAvLyAgICAgIHRva2Vuczoge1xuICAgKiAvLyAgICAgICAgbmFtZTogdW5kZWZpbmVkLFxuICAgKiAvLyAgICAgICAgcGFyZW50OiBudWxsLFxuICAgKiAvLyAgICAgICAgdG9rZW5zOiBbLi4uXSxcbiAgICogLy8gICAgICAgIGJsb2Nrczoge31cbiAgICogLy8gICAgICB9XG4gICAqIC8vICAgIH1cbiAgICpcbiAgICogSW4gb3JkZXIgdG8gcmVuZGVyIGEgcHJlLWNvbXBpbGVkIHRlbXBsYXRlLCB5b3UgbXVzdCBoYXZlIGFjY2VzcyB0byBmaWx0ZXJzIGFuZCB1dGlscyBmcm9tIFN3aWcuIDx2YXI+ZWZuPC92YXI+IGlzIHNpbXBseSBhbiBlbXB0eSBmdW5jdGlvbiB0aGF0IGRvZXMgbm90aGluZy5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBzb3VyY2UgIFN3aWcgdGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgICAgUmVuZGVyYWJsZSBmdW5jdGlvbiBhbmQgdG9rZW5zIG9iamVjdC5cbiAgICovXG4gIHRoaXMucHJlY29tcGlsZSA9IGZ1bmN0aW9uIChzb3VyY2UsIG9wdGlvbnMpIHtcbiAgICB2YXIgdG9rZW5zID0gc2VsZi5wYXJzZShzb3VyY2UsIG9wdGlvbnMpLFxuICAgICAgcGFyZW50cyA9IGdldFBhcmVudHModG9rZW5zLCBvcHRpb25zKSxcbiAgICAgIHRwbDtcblxuICAgIGlmIChwYXJlbnRzLmxlbmd0aCkge1xuICAgICAgLy8gUmVtYXAgdGhlIHRlbXBsYXRlcyBmaXJzdC1wYXJlbnQncyB0b2tlbnMgdXNpbmcgdGhpcyB0ZW1wbGF0ZSdzIGJsb2Nrcy5cbiAgICAgIHRva2Vucy50b2tlbnMgPSByZW1hcEJsb2Nrcyh0b2tlbnMuYmxvY2tzLCBwYXJlbnRzWzBdLnRva2Vucyk7XG4gICAgICBpbXBvcnROb25CbG9ja3ModG9rZW5zLmJsb2NrcywgdG9rZW5zLnRva2Vucyk7XG4gICAgfVxuXG4gICAgdHBsID0gbmV3IEZ1bmN0aW9uKCdfc3dpZycsICdfY3R4JywgJ19maWx0ZXJzJywgJ191dGlscycsICdfZm4nLFxuICAgICAgJyAgdmFyIF9leHQgPSBfc3dpZy5leHRlbnNpb25zLFxcbicgK1xuICAgICAgJyAgICBfb3V0cHV0ID0gXCJcIjtcXG4nICtcbiAgICAgIHBhcnNlci5jb21waWxlKHRva2VucywgcGFyZW50cywgb3B0aW9ucykgKyAnXFxuJyArXG4gICAgICAnICByZXR1cm4gX291dHB1dDtcXG4nXG4gICAgICApO1xuXG4gICAgcmV0dXJuIHsgdHBsOiB0cGwsIHRva2VuczogdG9rZW5zIH07XG4gIH07XG5cbiAgLyoqXG4gICAqIENvbXBpbGUgYW5kIHJlbmRlciBhIHRlbXBsYXRlIHN0cmluZyBmb3IgZmluYWwgb3V0cHV0LlxuICAgKlxuICAgKiBXaGVuIHJlbmRlcmluZyBhIHNvdXJjZSBzdHJpbmcsIGEgZmlsZSBwYXRoIHNob3VsZCBiZSBzcGVjaWZpZWQgaW4gdGhlIG9wdGlvbnMgb2JqZWN0IGluIG9yZGVyIGZvciA8dmFyPmV4dGVuZHM8L3Zhcj4sIDx2YXI+aW5jbHVkZTwvdmFyPiwgYW5kIDx2YXI+aW1wb3J0PC92YXI+IHRvIHdvcmsgcHJvcGVybHkuIERvIHRoaXMgYnkgYWRkaW5nIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPnsgZmlsZW5hbWU6ICcvYWJzb2x1dGUvcGF0aC90by9teXRwbC5odG1sJyB9PC9jb2RlPiB0byB0aGUgb3B0aW9ucyBhcmd1bWVudC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5yZW5kZXIoJ3t7IHRhY29zIH19JywgeyBsb2NhbHM6IHsgdGFjb3M6ICdUYWNvcyEhISEnIH19KTtcbiAgICogLy8gPT4gVGFjb3MhISEhXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc291cmNlICAgIFN3aWcgdGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICBSZW5kZXJlZCBvdXRwdXQuXG4gICAqL1xuICB0aGlzLnJlbmRlciA9IGZ1bmN0aW9uIChzb3VyY2UsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gc2VsZi5jb21waWxlKHNvdXJjZSwgb3B0aW9ucykoKTtcbiAgfTtcblxuICAvKipcbiAgICogQ29tcGlsZSBhbmQgcmVuZGVyIGEgdGVtcGxhdGUgZmlsZSBmb3IgZmluYWwgb3V0cHV0LiBUaGlzIGlzIG1vc3QgdXNlZnVsIGZvciBsaWJyYXJpZXMgbGlrZSBFeHByZXNzLmpzLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLnJlbmRlckZpbGUoJy4vdGVtcGxhdGUuaHRtbCcsIHt9LCBmdW5jdGlvbiAoZXJyLCBvdXRwdXQpIHtcbiAgICogICBpZiAoZXJyKSB7XG4gICAqICAgICB0aHJvdyBlcnI7XG4gICAqICAgfVxuICAgKiAgIGNvbnNvbGUubG9nKG91dHB1dCk7XG4gICAqIH0pO1xuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLnJlbmRlckZpbGUoJy4vdGVtcGxhdGUuaHRtbCcsIHt9KTtcbiAgICogLy8gPT4gb3V0cHV0XG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gICBwYXRoTmFtZSAgICBGaWxlIGxvY2F0aW9uLlxuICAgKiBAcGFyYW0gIHtvYmplY3R9ICAgW2xvY2Fscz17fV0gVGVtcGxhdGUgdmFyaWFibGUgY29udGV4dC5cbiAgICogQHBhcmFtICB7RnVuY3Rpb259IFtjYl0gQXN5bmNyb25vdXMgY2FsbGJhY2sgZnVuY3Rpb24uIElmIG5vdCBwcm92aWRlZCwgPHZhcj5jb21waWxlRmlsZTwvdmFyPiB3aWxsIHJ1biBzeW5jcm9ub3VzbHkuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgUmVuZGVyZWQgb3V0cHV0LlxuICAgKi9cbiAgdGhpcy5yZW5kZXJGaWxlID0gZnVuY3Rpb24gKHBhdGhOYW1lLCBsb2NhbHMsIGNiKSB7XG4gICAgaWYgKGNiKSB7XG4gICAgICBzZWxmLmNvbXBpbGVGaWxlKHBhdGhOYW1lLCB7fSwgZnVuY3Rpb24gKGVyciwgZm4pIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNiKG51bGwsIGZuKGxvY2FscykpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGYuY29tcGlsZUZpbGUocGF0aE5hbWUpKGxvY2Fscyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIENvbXBpbGUgc3RyaW5nIHNvdXJjZSBpbnRvIGEgcmVuZGVyYWJsZSB0ZW1wbGF0ZSBmdW5jdGlvbi5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIHRwbCA9IHN3aWcuY29tcGlsZSgne3sgdGFjb3MgfX0nKTtcbiAgICogLy8gPT4ge1xuICAgKiAvLyAgICAgIFtGdW5jdGlvbjogY29tcGlsZWRdXG4gICAqIC8vICAgICAgcGFyZW50OiBudWxsLFxuICAgKiAvLyAgICAgIHRva2VuczogW3sgY29tcGlsZTogW0Z1bmN0aW9uXSB9XSxcbiAgICogLy8gICAgICBibG9ja3M6IHt9XG4gICAqIC8vICAgIH1cbiAgICogdHBsKHsgdGFjb3M6ICdUYWNvcyEhISEnIH0pO1xuICAgKiAvLyA9PiBUYWNvcyEhISFcbiAgICpcbiAgICogV2hlbiBjb21waWxpbmcgYSBzb3VyY2Ugc3RyaW5nLCBhIGZpbGUgcGF0aCBzaG91bGQgYmUgc3BlY2lmaWVkIGluIHRoZSBvcHRpb25zIG9iamVjdCBpbiBvcmRlciBmb3IgPHZhcj5leHRlbmRzPC92YXI+LCA8dmFyPmluY2x1ZGU8L3Zhcj4sIGFuZCA8dmFyPmltcG9ydDwvdmFyPiB0byB3b3JrIHByb3Blcmx5LiBEbyB0aGlzIGJ5IGFkZGluZyA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj57IGZpbGVuYW1lOiAnL2Fic29sdXRlL3BhdGgvdG8vbXl0cGwuaHRtbCcgfTwvY29kZT4gdG8gdGhlIG9wdGlvbnMgYXJndW1lbnQuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc291cmNlICAgIFN3aWcgdGVtcGxhdGUgc291cmNlIHN0cmluZy5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtmdW5jdGlvbn0gICAgICAgICBSZW5kZXJhYmxlIGZ1bmN0aW9uIHdpdGgga2V5cyBmb3IgcGFyZW50LCBibG9ja3MsIGFuZCB0b2tlbnMuXG4gICAqL1xuICB0aGlzLmNvbXBpbGUgPSBmdW5jdGlvbiAoc291cmNlLCBvcHRpb25zKSB7XG4gICAgdmFyIGtleSA9IG9wdGlvbnMgPyBvcHRpb25zLmZpbGVuYW1lIDogbnVsbCxcbiAgICAgIGNhY2hlZCA9IGtleSA/IGNhY2hlR2V0KGtleSkgOiBudWxsLFxuICAgICAgY29udGV4dCxcbiAgICAgIGNvbnRleHRMZW5ndGgsXG4gICAgICBwcmU7XG5cbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICByZXR1cm4gY2FjaGVkO1xuICAgIH1cblxuICAgIGNvbnRleHQgPSBnZXRMb2NhbHMob3B0aW9ucyk7XG4gICAgY29udGV4dExlbmd0aCA9IHV0aWxzLmtleXMoY29udGV4dCkubGVuZ3RoO1xuICAgIHByZSA9IHRoaXMucHJlY29tcGlsZShzb3VyY2UsIG9wdGlvbnMpO1xuXG4gICAgZnVuY3Rpb24gY29tcGlsZWQobG9jYWxzKSB7XG4gICAgICB2YXIgbGNscztcbiAgICAgIGlmIChsb2NhbHMgJiYgY29udGV4dExlbmd0aCkge1xuICAgICAgICBsY2xzID0gdXRpbHMuZXh0ZW5kKHt9LCBjb250ZXh0LCBsb2NhbHMpO1xuICAgICAgfSBlbHNlIGlmIChsb2NhbHMgJiYgIWNvbnRleHRMZW5ndGgpIHtcbiAgICAgICAgbGNscyA9IGxvY2FscztcbiAgICAgIH0gZWxzZSBpZiAoIWxvY2FscyAmJiBjb250ZXh0TGVuZ3RoKSB7XG4gICAgICAgIGxjbHMgPSBjb250ZXh0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGNscyA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHByZS50cGwoc2VsZiwgbGNscywgZmlsdGVycywgdXRpbHMsIGVmbik7XG4gICAgfVxuXG4gICAgdXRpbHMuZXh0ZW5kKGNvbXBpbGVkLCBwcmUudG9rZW5zKTtcblxuICAgIGlmIChrZXkpIHtcbiAgICAgIGNhY2hlU2V0KGtleSwgY29tcGlsZWQpO1xuICAgIH1cblxuICAgIHJldHVybiBjb21waWxlZDtcbiAgfTtcblxuICAvKipcbiAgICogQ29tcGlsZSBhIHNvdXJjZSBmaWxlIGludG8gYSByZW5kZXJhYmxlIHRlbXBsYXRlIGZ1bmN0aW9uLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiB2YXIgdHBsID0gc3dpZy5jb21waWxlRmlsZSgnLi9teXRwbC5odG1sJyk7XG4gICAqIC8vID0+IHtcbiAgICogLy8gICAgICBbRnVuY3Rpb246IGNvbXBpbGVkXVxuICAgKiAvLyAgICAgIHBhcmVudDogbnVsbCxcbiAgICogLy8gICAgICB0b2tlbnM6IFt7IGNvbXBpbGU6IFtGdW5jdGlvbl0gfV0sXG4gICAqIC8vICAgICAgYmxvY2tzOiB7fVxuICAgKiAvLyAgICB9XG4gICAqIHRwbCh7IHRhY29zOiAnVGFjb3MhISEhJyB9KTtcbiAgICogLy8gPT4gVGFjb3MhISEhXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcuY29tcGlsZUZpbGUoJy9teWZpbGUudHh0JywgeyB2YXJDb250cm9sczogWyc8JT0nLCAnPSU+J10sIHRhZ0NvbnRyb2xzOiBbJzwlJywgJyU+J119KTtcbiAgICogLy8gPT4gd2lsbCBjb21waWxlICdteWZpbGUudHh0JyB1c2luZyB0aGUgdmFyIGFuZCB0YWcgY29udHJvbHMgYXMgc3BlY2lmaWVkLlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHBhdGhuYW1lICBGaWxlIGxvY2F0aW9uLlxuICAgKiBAcGFyYW0gIHtTd2lnT3B0c30gW29wdGlvbnM9e31dIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2JdIEFzeW5jcm9ub3VzIGNhbGxiYWNrIGZ1bmN0aW9uLiBJZiBub3QgcHJvdmlkZWQsIDx2YXI+Y29tcGlsZUZpbGU8L3Zhcj4gd2lsbCBydW4gc3luY3Jvbm91c2x5LlxuICAgKiBAcmV0dXJuIHtmdW5jdGlvbn0gICAgICAgICBSZW5kZXJhYmxlIGZ1bmN0aW9uIHdpdGgga2V5cyBmb3IgcGFyZW50LCBibG9ja3MsIGFuZCB0b2tlbnMuXG4gICAqL1xuICB0aGlzLmNvbXBpbGVGaWxlID0gZnVuY3Rpb24gKHBhdGhuYW1lLCBvcHRpb25zLCBjYikge1xuICAgIHZhciBzcmMsIGNhY2hlZDtcblxuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IHt9O1xuICAgIH1cblxuICAgIHBhdGhuYW1lID0gc2VsZi5vcHRpb25zLmxvYWRlci5yZXNvbHZlKHBhdGhuYW1lLCBvcHRpb25zLnJlc29sdmVGcm9tKTtcbiAgICBpZiAoIW9wdGlvbnMuZmlsZW5hbWUpIHtcbiAgICAgIG9wdGlvbnMgPSB1dGlscy5leHRlbmQoeyBmaWxlbmFtZTogcGF0aG5hbWUgfSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGNhY2hlZCA9IGNhY2hlR2V0KHBhdGhuYW1lKTtcblxuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIGlmIChjYikge1xuICAgICAgICBjYihudWxsLCBjYWNoZWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gY2FjaGVkO1xuICAgIH1cblxuICAgIGlmIChjYikge1xuICAgICAgc2VsZi5vcHRpb25zLmxvYWRlci5sb2FkKHBhdGhuYW1lLCBmdW5jdGlvbiAoZXJyLCBzcmMpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjb21waWxlZDtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbXBpbGVkID0gc2VsZi5jb21waWxlKHNyYywgb3B0aW9ucyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjIpIHtcbiAgICAgICAgICBjYihlcnIyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjYihlcnIsIGNvbXBpbGVkKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNyYyA9IHNlbGYub3B0aW9ucy5sb2FkZXIubG9hZChwYXRobmFtZSk7XG4gICAgcmV0dXJuIHNlbGYuY29tcGlsZShzcmMsIG9wdGlvbnMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSdW4gYSBwcmUtY29tcGlsZWQgdGVtcGxhdGUgZnVuY3Rpb24uIFRoaXMgaXMgbW9zdCB1c2VmdWwgaW4gdGhlIGJyb3dzZXIgd2hlbiB5b3UndmUgcHJlLWNvbXBpbGVkIHlvdXIgdGVtcGxhdGVzIHdpdGggdGhlIFN3aWcgY29tbWFuZC1saW5lIHRvb2wuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqICQgc3dpZyBjb21waWxlIC4vbXl0cGwuaHRtbCAtLXdyYXAtc3RhcnQ9XCJ2YXIgbXl0cGwgPSBcIiA+IG15dHBsLmpzXG4gICAqIEBleGFtcGxlXG4gICAqIDxzY3JpcHQgc3JjPVwibXl0cGwuanNcIj48L3NjcmlwdD5cbiAgICogPHNjcmlwdD5cbiAgICogICBzd2lnLnJ1bihteXRwbCwge30pO1xuICAgKiAgIC8vID0+IFwicmVuZGVyZWQgdGVtcGxhdGUuLi5cIlxuICAgKiA8L3NjcmlwdD5cbiAgICpcbiAgICogQHBhcmFtICB7ZnVuY3Rpb259IHRwbCAgICAgICBQcmUtY29tcGlsZWQgU3dpZyB0ZW1wbGF0ZSBmdW5jdGlvbi4gVXNlIHRoZSBTd2lnIENMSSB0byBjb21waWxlIHlvdXIgdGVtcGxhdGVzLlxuICAgKiBAcGFyYW0gIHtvYmplY3R9IFtsb2NhbHM9e31dIFRlbXBsYXRlIHZhcmlhYmxlIGNvbnRleHQuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gW2ZpbGVwYXRoXSAgRmlsZW5hbWUgdXNlZCBmb3IgY2FjaGluZyB0aGUgdGVtcGxhdGUuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgUmVuZGVyZWQgb3V0cHV0LlxuICAgKi9cbiAgdGhpcy5ydW4gPSBmdW5jdGlvbiAodHBsLCBsb2NhbHMsIGZpbGVwYXRoKSB7XG4gICAgdmFyIGNvbnRleHQgPSBnZXRMb2NhbHMoeyBsb2NhbHM6IGxvY2FscyB9KTtcbiAgICBpZiAoZmlsZXBhdGgpIHtcbiAgICAgIGNhY2hlU2V0KGZpbGVwYXRoLCB0cGwpO1xuICAgIH1cbiAgICByZXR1cm4gdHBsKHNlbGYsIGNvbnRleHQsIGZpbHRlcnMsIHV0aWxzLCBlZm4pO1xuICB9O1xufTtcblxuLyohXG4gKiBFeHBvcnQgbWV0aG9kcyBwdWJsaWNseVxuICovXG5kZWZhdWx0SW5zdGFuY2UgPSBuZXcgZXhwb3J0cy5Td2lnKCk7XG5leHBvcnRzLnNldEZpbHRlciA9IGRlZmF1bHRJbnN0YW5jZS5zZXRGaWx0ZXI7XG5leHBvcnRzLnNldFRhZyA9IGRlZmF1bHRJbnN0YW5jZS5zZXRUYWc7XG5leHBvcnRzLnNldEV4dGVuc2lvbiA9IGRlZmF1bHRJbnN0YW5jZS5zZXRFeHRlbnNpb247XG5leHBvcnRzLnBhcnNlRmlsZSA9IGRlZmF1bHRJbnN0YW5jZS5wYXJzZUZpbGU7XG5leHBvcnRzLnByZWNvbXBpbGUgPSBkZWZhdWx0SW5zdGFuY2UucHJlY29tcGlsZTtcbmV4cG9ydHMuY29tcGlsZSA9IGRlZmF1bHRJbnN0YW5jZS5jb21waWxlO1xuZXhwb3J0cy5jb21waWxlRmlsZSA9IGRlZmF1bHRJbnN0YW5jZS5jb21waWxlRmlsZTtcbmV4cG9ydHMucmVuZGVyID0gZGVmYXVsdEluc3RhbmNlLnJlbmRlcjtcbmV4cG9ydHMucmVuZGVyRmlsZSA9IGRlZmF1bHRJbnN0YW5jZS5yZW5kZXJGaWxlO1xuZXhwb3J0cy5ydW4gPSBkZWZhdWx0SW5zdGFuY2UucnVuO1xuZXhwb3J0cy5pbnZhbGlkYXRlQ2FjaGUgPSBkZWZhdWx0SW5zdGFuY2UuaW52YWxpZGF0ZUNhY2hlO1xuZXhwb3J0cy5sb2FkZXJzID0gbG9hZGVycztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvc3dpZy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyksXG4gIHN0cmluZ3MgPSBbJ2h0bWwnLCAnanMnXTtcblxuLyoqXG4gKiBDb250cm9sIGF1dG8tZXNjYXBpbmcgb2YgdmFyaWFibGUgb3V0cHV0IGZyb20gd2l0aGluIHlvdXIgdGVtcGxhdGVzLlxuICpcbiAqIEBhbGlhcyBhdXRvZXNjYXBlXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15dmFyID0gJzxmb28+JztcbiAqIHslIGF1dG9lc2NhcGUgdHJ1ZSAlfXt7IG15dmFyIH19eyUgZW5kYXV0b2VzY2FwZSAlfVxuICogLy8gPT4gJmx0O2ZvbyZndDtcbiAqIHslIGF1dG9lc2NhcGUgZmFsc2UgJX17eyBteXZhciB9fXslIGVuZGF1dG9lc2NhcGUgJX1cbiAqIC8vID0+IDxmb28+XG4gKlxuICogQHBhcmFtIHtib29sZWFufHN0cmluZ30gY29udHJvbCBPbmUgb2YgYHRydWVgLCBgZmFsc2VgLCBgXCJqc1wiYCBvciBgXCJodG1sXCJgLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICByZXR1cm4gY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKTtcbn07XG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2ssIG9wdHMpIHtcbiAgdmFyIG1hdGNoZWQ7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghbWF0Y2hlZCAmJlxuICAgICAgICAodG9rZW4udHlwZSA9PT0gdHlwZXMuQk9PTCB8fFxuICAgICAgICAgICh0b2tlbi50eXBlID09PSB0eXBlcy5TVFJJTkcgJiYgc3RyaW5ncy5pbmRleE9mKHRva2VuLm1hdGNoKSA9PT0gLTEpKVxuICAgICAgICApIHtcbiAgICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgbWF0Y2hlZCA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgdG9rZW4gXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgaW4gYXV0b2VzY2FwZSB0YWcnLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9hdXRvZXNjYXBlLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIERlZmluZXMgYSBibG9jayBpbiBhIHRlbXBsYXRlIHRoYXQgY2FuIGJlIG92ZXJyaWRkZW4gYnkgYSB0ZW1wbGF0ZSBleHRlbmRpbmcgdGhpcyBvbmUgYW5kL29yIHdpbGwgb3ZlcnJpZGUgdGhlIGN1cnJlbnQgdGVtcGxhdGUncyBwYXJlbnQgdGVtcGxhdGUgYmxvY2sgb2YgdGhlIHNhbWUgbmFtZS5cbiAqXG4gKiBTZWUgPGEgaHJlZj1cIiNpbmhlcml0YW5jZVwiPlRlbXBsYXRlIEluaGVyaXRhbmNlPC9hPiBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cbiAqXG4gKiBAYWxpYXMgYmxvY2tcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgYmxvY2sgYm9keSAlfS4uLnslIGVuZGJsb2NrICV9XG4gKlxuICogQHBhcmFtIHtsaXRlcmFsfSAgbmFtZSAgIE5hbWUgb2YgdGhlIGJsb2NrIGZvciB1c2UgaW4gcGFyZW50IGFuZCBleHRlbmRlZCB0ZW1wbGF0ZXMuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucykge1xuICByZXR1cm4gY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYXJncy5qb2luKCcnKSk7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyKSB7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuZXhwb3J0cy5ibG9jayA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvYmxvY2suanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogVXNlZCB3aXRoaW4gYW4gPGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBpZiAlfTwvY29kZT4gdGFnLCB0aGUgY29kZSBibG9jayBmb2xsb3dpbmcgdGhpcyB0YWcgdXAgdW50aWwgPGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBlbmRpZiAlfTwvY29kZT4gd2lsbCBiZSByZW5kZXJlZCBpZiB0aGUgPGk+aWY8L2k+IHN0YXRlbWVudCByZXR1cm5zIGZhbHNlLlxuICpcbiAqIEBhbGlhcyBlbHNlXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIGZhbHNlICV9XG4gKiAgIHN0YXRlbWVudDFcbiAqIHslIGVsc2UgJX1cbiAqICAgc3RhdGVtZW50MlxuICogeyUgZW5kaWYgJX1cbiAqIC8vID0+IHN0YXRlbWVudDJcbiAqXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuICd9IGVsc2Uge1xcbic7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2spIHtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdcImVsc2VcIiB0YWcgZG9lcyBub3QgYWNjZXB0IGFueSB0b2tlbnMuIEZvdW5kIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcblxuICByZXR1cm4gKHN0YWNrLmxlbmd0aCAmJiBzdGFja1tzdGFjay5sZW5ndGggLSAxXS5uYW1lID09PSAnaWYnKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZWxzZS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlmcGFyc2VyID0gcmVxdWlyZSgnLi9pZicpLnBhcnNlO1xuXG4vKipcbiAqIExpa2UgPGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBlbHNlICV9PC9jb2RlPiwgZXhjZXB0IHRoaXMgdGFnIGNhbiB0YWtlIG1vcmUgY29uZGl0aW9uYWwgc3RhdGVtZW50cy5cbiAqXG4gKiBAYWxpYXMgZWxzZWlmXG4gKiBAYWxpYXMgZWxpZlxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiBmYWxzZSAlfVxuICogICBUYWNvc1xuICogeyUgZWxzZWlmIHRydWUgJX1cbiAqICAgQnVycml0b3NcbiAqIHslIGVsc2UgJX1cbiAqICAgQ2h1cnJvc1xuICogeyUgZW5kaWYgJX1cbiAqIC8vID0+IEJ1cnJpdG9zXG4gKlxuICogQHBhcmFtIHsuLi5taXhlZH0gY29uZGl0aW9uYWwgIENvbmRpdGlvbmFsIHN0YXRlbWVudCB0aGF0IHJldHVybnMgYSB0cnV0aHkgb3IgZmFsc3kgdmFsdWUuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncykge1xuICByZXR1cm4gJ30gZWxzZSBpZiAoJyArIGFyZ3Muam9pbignICcpICsgJykge1xcbic7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2spIHtcbiAgdmFyIG9rYXkgPSBpZnBhcnNlcihzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrKTtcbiAgcmV0dXJuIG9rYXkgJiYgKHN0YWNrLmxlbmd0aCAmJiBzdGFja1tzdGFjay5sZW5ndGggLSAxXS5uYW1lID09PSAnaWYnKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZWxzZWlmLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIE1ha2VzIHRoZSBjdXJyZW50IHRlbXBsYXRlIGV4dGVuZCBhIHBhcmVudCB0ZW1wbGF0ZS4gVGhpcyB0YWcgbXVzdCBiZSB0aGUgZmlyc3QgaXRlbSBpbiB5b3VyIHRlbXBsYXRlLlxuICpcbiAqIFNlZSA8YSBocmVmPVwiI2luaGVyaXRhbmNlXCI+VGVtcGxhdGUgSW5oZXJpdGFuY2U8L2E+IGZvciBtb3JlIGluZm9ybWF0aW9uLlxuICpcbiAqIEBhbGlhcyBleHRlbmRzXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGV4dGVuZHMgXCIuL2xheW91dC5odG1sXCIgJX1cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGFyZW50RmlsZSAgUmVsYXRpdmUgcGF0aCB0byB0aGUgZmlsZSB0aGF0IHRoaXMgdGVtcGxhdGUgZXh0ZW5kcy5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKCkge307XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gZmFsc2U7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZXh0ZW5kcy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGZpbHRlcnMgPSByZXF1aXJlKCcuLi9maWx0ZXJzJyk7XG5cbi8qKlxuICogQXBwbHkgYSBmaWx0ZXIgdG8gYW4gZW50aXJlIGJsb2NrIG9mIHRlbXBsYXRlLlxuICpcbiAqIEBhbGlhcyBmaWx0ZXJcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgZmlsdGVyIHVwcGVyY2FzZSAlfW9oIGhpLCB7eyBuYW1lIH19eyUgZW5kZmlsdGVyICV9XG4gKiAvLyA9PiBPSCBISSwgUEFVTFxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBmaWx0ZXIgcmVwbGFjZShcIi5cIiwgXCIhXCIsIFwiZ1wiKSAlfUhpLiBNeSBuYW1lIGlzIFBhdWwueyUgZW5kZmlsdGVyICV9XG4gKiAvLyA9PiBIaSEgTXkgbmFtZSBpcyBQYXVsIVxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGZpbHRlciAgVGhlIGZpbHRlciB0aGF0IHNob3VsZCBiZSBhcHBsaWVkIHRvIHRoZSBjb250ZW50cyBvZiB0aGUgdGFnLlxuICovXG5cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIHZhciBmaWx0ZXIgPSBhcmdzLnNoaWZ0KCkucmVwbGFjZSgvXFwoJC8sICcnKSxcbiAgICB2YWwgPSAnKGZ1bmN0aW9uICgpIHtcXG4nICtcbiAgICAgICcgIHZhciBfb3V0cHV0ID0gXCJcIjtcXG4nICtcbiAgICAgIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkgK1xuICAgICAgJyAgcmV0dXJuIF9vdXRwdXQ7XFxuJyArXG4gICAgICAnfSkoKSc7XG5cbiAgaWYgKGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gJyknKSB7XG4gICAgYXJncy5wb3AoKTtcbiAgfVxuXG4gIGFyZ3MgPSAoYXJncy5sZW5ndGgpID8gJywgJyArIGFyZ3Muam9pbignJykgOiAnJztcbiAgcmV0dXJuICdfb3V0cHV0ICs9IF9maWx0ZXJzW1wiJyArIGZpbHRlciArICdcIl0oJyArIHZhbCArIGFyZ3MgKyAnKTtcXG4nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMpIHtcbiAgdmFyIGZpbHRlcjtcblxuICBmdW5jdGlvbiBjaGVjayhmaWx0ZXIpIHtcbiAgICBpZiAoIWZpbHRlcnMuaGFzT3duUHJvcGVydHkoZmlsdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGaWx0ZXIgXCInICsgZmlsdGVyICsgJ1wiIGRvZXMgbm90IGV4aXN0IG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlci5vbih0eXBlcy5GVU5DVElPTiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFmaWx0ZXIpIHtcbiAgICAgIGZpbHRlciA9IHRva2VuLm1hdGNoLnJlcGxhY2UoL1xcKCQvLCAnJyk7XG4gICAgICBjaGVjayhmaWx0ZXIpO1xuICAgICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICB0aGlzLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIWZpbHRlcikge1xuICAgICAgZmlsdGVyID0gdG9rZW4ubWF0Y2g7XG4gICAgICBjaGVjayhmaWx0ZXIpO1xuICAgICAgdGhpcy5vdXQucHVzaChmaWx0ZXIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2ZpbHRlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGN0eCA9ICdfY3R4LicsXG4gIGN0eGxvb3AgPSBjdHggKyAnbG9vcCcsXG4gIGN0eGxvb3BjYWNoZSA9IGN0eCArICdfX19sb29wY2FjaGUnO1xuXG4vKipcbiAqIExvb3Agb3ZlciBvYmplY3RzIGFuZCBhcnJheXMuXG4gKlxuICogQGFsaWFzIGZvclxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBvYmogPSB7IG9uZTogJ2hpJywgdHdvOiAnYnllJyB9O1xuICogeyUgZm9yIHggaW4gb2JqICV9XG4gKiAgIHslIGlmIGxvb3AuZmlyc3QgJX08dWw+eyUgZW5kaWYgJX1cbiAqICAgPGxpPnt7IGxvb3AuaW5kZXggfX0gLSB7eyBsb29wLmtleSB9fToge3sgeCB9fTwvbGk+XG4gKiAgIHslIGlmIGxvb3AubGFzdCAlfTwvdWw+eyUgZW5kaWYgJX1cbiAqIHslIGVuZGZvciAlfVxuICogLy8gPT4gPHVsPlxuICogLy8gICAgPGxpPjEgLSBvbmU6IGhpPC9saT5cbiAqIC8vICAgIDxsaT4yIC0gdHdvOiBieWU8L2xpPlxuICogLy8gICAgPC91bD5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gYXJyID0gWzEsIDIsIDNdXG4gKiAvLyBSZXZlcnNlIHRoZSBhcnJheSwgc2hvcnRjdXQgdGhlIGtleS9pbmRleCB0byBga2V5YFxuICogeyUgZm9yIGtleSwgdmFsIGluIGFycnxyZXZlcnNlICV9XG4gKiB7eyBrZXkgfX0gLS0ge3sgdmFsIH19XG4gKiB7JSBlbmRmb3IgJX1cbiAqIC8vID0+IDAgLS0gM1xuICogLy8gICAgMSAtLSAyXG4gKiAvLyAgICAyIC0tIDFcbiAqXG4gKiBAcGFyYW0ge2xpdGVyYWx9IFtrZXldICAgICBBIHNob3J0Y3V0IHRvIHRoZSBpbmRleCBvZiB0aGUgYXJyYXkgb3IgY3VycmVudCBrZXkgYWNjZXNzb3IuXG4gKiBAcGFyYW0ge2xpdGVyYWx9IHZhcmlhYmxlICBUaGUgY3VycmVudCB2YWx1ZSB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoaXMgdmFyaWFibGUgbmFtZSB0ZW1wb3JhcmlseS4gVGhlIHZhcmlhYmxlIHdpbGwgYmUgcmVzZXQgdXBvbiBlbmRpbmcgdGhlIGZvciB0YWcuXG4gKiBAcGFyYW0ge2xpdGVyYWx9IGluICAgICAgICBMaXRlcmFsbHksIFwiaW5cIi4gVGhpcyB0b2tlbiBpcyByZXF1aXJlZC5cbiAqIEBwYXJhbSB7b2JqZWN0fSAgb2JqZWN0ICAgIEFuIGVudW1lcmFibGUgb2JqZWN0IHRoYXQgd2lsbCBiZSBpdGVyYXRlZCBvdmVyLlxuICpcbiAqIEByZXR1cm4ge2xvb3AuaW5kZXh9IFRoZSBjdXJyZW50IGl0ZXJhdGlvbiBvZiB0aGUgbG9vcCAoMS1pbmRleGVkKVxuICogQHJldHVybiB7bG9vcC5pbmRleDB9IFRoZSBjdXJyZW50IGl0ZXJhdGlvbiBvZiB0aGUgbG9vcCAoMC1pbmRleGVkKVxuICogQHJldHVybiB7bG9vcC5yZXZpbmRleH0gVGhlIG51bWJlciBvZiBpdGVyYXRpb25zIGZyb20gdGhlIGVuZCBvZiB0aGUgbG9vcCAoMS1pbmRleGVkKVxuICogQHJldHVybiB7bG9vcC5yZXZpbmRleDB9IFRoZSBudW1iZXIgb2YgaXRlcmF0aW9ucyBmcm9tIHRoZSBlbmQgb2YgdGhlIGxvb3AgKDAtaW5kZXhlZClcbiAqIEByZXR1cm4ge2xvb3Aua2V5fSBJZiB0aGUgaXRlcmF0b3IgaXMgYW4gb2JqZWN0LCB0aGlzIHdpbGwgYmUgdGhlIGtleSBvZiB0aGUgY3VycmVudCBpdGVtLCBvdGhlcndpc2UgaXQgd2lsbCBiZSB0aGUgc2FtZSBhcyB0aGUgbG9vcC5pbmRleC5cbiAqIEByZXR1cm4ge2xvb3AuZmlyc3R9IFRydWUgaWYgdGhlIGN1cnJlbnQgb2JqZWN0IGlzIHRoZSBmaXJzdCBpbiB0aGUgb2JqZWN0IG9yIGFycmF5LlxuICogQHJldHVybiB7bG9vcC5sYXN0fSBUcnVlIGlmIHRoZSBjdXJyZW50IG9iamVjdCBpcyB0aGUgbGFzdCBpbiB0aGUgb2JqZWN0IG9yIGFycmF5LlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICB2YXIgdmFsID0gYXJncy5zaGlmdCgpLFxuICAgIGtleSA9ICdfX2snLFxuICAgIGxhc3Q7XG5cbiAgaWYgKGFyZ3NbMF0gJiYgYXJnc1swXSA9PT0gJywnKSB7XG4gICAgYXJncy5zaGlmdCgpO1xuICAgIGtleSA9IHZhbDtcbiAgICB2YWwgPSBhcmdzLnNoaWZ0KCk7XG4gIH1cblxuICBsYXN0ID0gYXJncy5qb2luKCcnKTtcblxuICByZXR1cm4gW1xuICAgICcoZnVuY3Rpb24gKCkge1xcbicsXG4gICAgJyAgdmFyIF9fbCA9ICcgKyBsYXN0ICsgJywgX19sZW4gPSAoX3V0aWxzLmlzQXJyYXkoX19sKSkgPyBfX2wubGVuZ3RoIDogX3V0aWxzLmtleXMoX19sKS5sZW5ndGg7XFxuJyxcbiAgICAnICBpZiAoIV9fbCkgeyByZXR1cm47IH1cXG4nLFxuICAgICcgICcgKyBjdHhsb29wY2FjaGUgKyAnID0geyBsb29wOiAnICsgY3R4bG9vcCArICcsICcgKyB2YWwgKyAnOiAnICsgY3R4ICsgdmFsICsgJywgJyArIGtleSArICc6ICcgKyBjdHggKyBrZXkgKyAnIH07XFxuJyxcbiAgICAnICAnICsgY3R4bG9vcCArICcgPSB7IGZpcnN0OiBmYWxzZSwgaW5kZXg6IDEsIGluZGV4MDogMCwgcmV2aW5kZXg6IF9fbGVuLCByZXZpbmRleDA6IF9fbGVuIC0gMSwgbGVuZ3RoOiBfX2xlbiwgbGFzdDogZmFsc2UgfTtcXG4nLFxuICAgICcgIF91dGlscy5lYWNoKF9fbCwgZnVuY3Rpb24gKCcgKyB2YWwgKyAnLCAnICsga2V5ICsgJykge1xcbicsXG4gICAgJyAgICAnICsgY3R4ICsgdmFsICsgJyA9ICcgKyB2YWwgKyAnO1xcbicsXG4gICAgJyAgICAnICsgY3R4ICsga2V5ICsgJyA9ICcgKyBrZXkgKyAnO1xcbicsXG4gICAgJyAgICAnICsgY3R4bG9vcCArICcua2V5ID0gJyArIGtleSArICc7XFxuJyxcbiAgICAnICAgICcgKyBjdHhsb29wICsgJy5maXJzdCA9ICgnICsgY3R4bG9vcCArICcuaW5kZXgwID09PSAwKTtcXG4nLFxuICAgICcgICAgJyArIGN0eGxvb3AgKyAnLmxhc3QgPSAoJyArIGN0eGxvb3AgKyAnLnJldmluZGV4MCA9PT0gMCk7XFxuJyxcbiAgICAnICAgICcgKyBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpLFxuICAgICcgICAgJyArIGN0eGxvb3AgKyAnLmluZGV4ICs9IDE7ICcgKyBjdHhsb29wICsgJy5pbmRleDAgKz0gMTsgJyArIGN0eGxvb3AgKyAnLnJldmluZGV4IC09IDE7ICcgKyBjdHhsb29wICsgJy5yZXZpbmRleDAgLT0gMTtcXG4nLFxuICAgICcgIH0pO1xcbicsXG4gICAgJyAgJyArIGN0eGxvb3AgKyAnID0gJyArIGN0eGxvb3BjYWNoZSArICcubG9vcDtcXG4nLFxuICAgICcgICcgKyBjdHggKyB2YWwgKyAnID0gJyArIGN0eGxvb3BjYWNoZSArICcuJyArIHZhbCArICc7XFxuJyxcbiAgICAnICAnICsgY3R4ICsga2V5ICsgJyA9ICcgKyBjdHhsb29wY2FjaGUgKyAnLicgKyBrZXkgKyAnO1xcbicsXG4gICAgJ30pKCk7XFxuJ1xuICBdLmpvaW4oJycpO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMpIHtcbiAgdmFyIGZpcnN0VmFyLCByZWFkeTtcblxuICBwYXJzZXIub24odHlwZXMuTlVNQkVSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB2YXIgbGFzdFN0YXRlID0gdGhpcy5zdGF0ZS5sZW5ndGggPyB0aGlzLnN0YXRlW3RoaXMuc3RhdGUubGVuZ3RoIC0gMV0gOiBudWxsO1xuICAgIGlmICghcmVhZHkgfHxcbiAgICAgICAgKGxhc3RTdGF0ZSAhPT0gdHlwZXMuQVJSQVlPUEVOICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSB0eXBlcy5DVVJMWU9QRU4gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IHR5cGVzLkNVUkxZQ0xPU0UgJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IHR5cGVzLkZVTkNUSU9OICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSB0eXBlcy5GSUxURVIpXG4gICAgICAgICkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIG51bWJlciBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmIChyZWFkeSAmJiBmaXJzdFZhcikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLm91dC5sZW5ndGgpIHtcbiAgICAgIGZpcnN0VmFyID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkNPTU1BLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoZmlyc3RWYXIgJiYgdGhpcy5wcmV2VG9rZW4udHlwZSA9PT0gdHlwZXMuVkFSKSB7XG4gICAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkNPTVBBUkFUT1IsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICh0b2tlbi5tYXRjaCAhPT0gJ2luJyB8fCAhZmlyc3RWYXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB0b2tlbiBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgcmVhZHkgPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZm9yLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIFVzZWQgdG8gY3JlYXRlIGNvbmRpdGlvbmFsIHN0YXRlbWVudHMgaW4gdGVtcGxhdGVzLiBBY2NlcHRzIG1vc3QgSmF2YVNjcmlwdCB2YWxpZCBjb21wYXJpc29ucy5cbiAqXG4gKiBDYW4gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIDxhIGhyZWY9XCIjZWxzZWlmXCI+PGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBlbHNlaWYgLi4uICV9PC9jb2RlPjwvYT4gYW5kIDxhIGhyZWY9XCIjZWxzZVwiPjxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgZWxzZSAlfTwvY29kZT48L2E+IHRhZ3MuXG4gKlxuICogQGFsaWFzIGlmXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHggJX17JSBlbmRpZiAlfVxuICogeyUgaWYgIXggJX17JSBlbmRpZiAlfVxuICogeyUgaWYgbm90IHggJX17JSBlbmRpZiAlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4IGFuZCB5ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmIHggJiYgeSAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiB4IG9yIHkgJX17JSBlbmRpZiAlfVxuICogeyUgaWYgeCB8fCB5ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmIHggfHwgKHkgJiYgeikgJX17JSBlbmRpZiAlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4IFtvcGVyYXRvcl0geSAlfVxuICogICBPcGVyYXRvcnM6ID09LCAhPSwgPCwgPD0sID4sID49LCA9PT0sICE9PVxuICogeyUgZW5kaWYgJX1cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeCA9PSAnZml2ZScgJX1cbiAqICAgVGhlIG9wZXJhbmRzIGNhbiBiZSBhbHNvIGJlIHN0cmluZyBvciBudW1iZXIgbGl0ZXJhbHNcbiAqIHslIGVuZGlmICV9XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHh8bG93ZXIgPT09ICd0YWNvcycgJX1cbiAqICAgWW91IGNhbiB1c2UgZmlsdGVycyBvbiBhbnkgb3BlcmFuZCBpbiB0aGUgc3RhdGVtZW50LlxuICogeyUgZW5kaWYgJX1cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeCBpbiB5ICV9XG4gKiAgIElmIHggaXMgYSB2YWx1ZSB0aGF0IGlzIHByZXNlbnQgaW4geSwgdGhpcyB3aWxsIHJldHVybiB0cnVlLlxuICogeyUgZW5kaWYgJX1cbiAqXG4gKiBAcGFyYW0gey4uLm1peGVkfSBjb25kaXRpb25hbCBDb25kaXRpb25hbCBzdGF0ZW1lbnQgdGhhdCByZXR1cm5zIGEgdHJ1dGh5IG9yIGZhbHN5IHZhbHVlLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICByZXR1cm4gJ2lmICgnICsgYXJncy5qb2luKCcgJykgKyAnKSB7IFxcbicgK1xuICAgIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkgKyAnXFxuJyArXG4gICAgJ30nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMpIHtcbiAgcGFyc2VyLm9uKHR5cGVzLkNPTVBBUkFUT1IsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICh0aGlzLmlzTGFzdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGxvZ2ljIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICBpZiAodGhpcy5wcmV2VG9rZW4udHlwZSA9PT0gdHlwZXMuTk9UKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0dGVtcHRlZCBsb2dpYyBcIm5vdCAnICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuIFVzZSAhKGZvbyAnICsgdG9rZW4ubWF0Y2ggKyAnKSBpbnN0ZWFkLicpO1xuICAgIH1cbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLk5PVCwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHRoaXMuaXNMYXN0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbG9naWMgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQk9PTCwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5MT0dJQywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLm91dC5sZW5ndGggfHwgdGhpcy5pc0xhc3QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBsb2dpYyBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgdGhpcy5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2lmLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEFsbG93cyB5b3UgdG8gaW1wb3J0IG1hY3JvcyBmcm9tIGFub3RoZXIgZmlsZSBkaXJlY3RseSBpbnRvIHlvdXIgY3VycmVudCBjb250ZXh0LlxuICogVGhlIGltcG9ydCB0YWcgaXMgc3BlY2lmaWNhbGx5IGRlc2lnbmVkIGZvciBpbXBvcnRpbmcgbWFjcm9zIGludG8geW91ciB0ZW1wbGF0ZSB3aXRoIGEgc3BlY2lmaWMgY29udGV4dCBzY29wZS4gVGhpcyBpcyB2ZXJ5IHVzZWZ1bCBmb3Iga2VlcGluZyB5b3VyIG1hY3JvcyBmcm9tIG92ZXJyaWRpbmcgdGVtcGxhdGUgY29udGV4dCB0aGF0IGlzIGJlaW5nIGluamVjdGVkIGJ5IHlvdXIgc2VydmVyLXNpZGUgcGFnZSBnZW5lcmF0aW9uLlxuICpcbiAqIEBhbGlhcyBpbXBvcnRcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaW1wb3J0ICcuL2Zvcm1tYWNyb3MuaHRtbCcgYXMgZm9ybXMgJX1cbiAqIHt7IGZvcm0uaW5wdXQoXCJ0ZXh0XCIsIFwibmFtZVwiKSB9fVxuICogLy8gPT4gPGlucHV0IHR5cGU9XCJ0ZXh0XCIgbmFtZT1cIm5hbWVcIj5cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaW1wb3J0IFwiLi4vc2hhcmVkL3RhZ3MuaHRtbFwiIGFzIHRhZ3MgJX1cbiAqIHt7IHRhZ3Muc3R5bGVzaGVldCgnZ2xvYmFsJykgfX1cbiAqIC8vID0+IDxsaW5rIHJlbD1cInN0eWxlc2hlZXRcIiBocmVmPVwiL2dsb2JhbC5jc3NcIj5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ3x2YXJ9ICBmaWxlICAgICAgUmVsYXRpdmUgcGF0aCBmcm9tIHRoZSBjdXJyZW50IHRlbXBsYXRlIGZpbGUgdG8gdGhlIGZpbGUgdG8gaW1wb3J0IG1hY3JvcyBmcm9tLlxuICogQHBhcmFtIHtsaXRlcmFsfSAgICAgYXMgICAgICAgIExpdGVyYWxseSwgXCJhc1wiLlxuICogQHBhcmFtIHtsaXRlcmFsfSAgICAgdmFybmFtZSAgIExvY2FsLWFjY2Vzc2libGUgb2JqZWN0IG5hbWUgdG8gYXNzaWduIHRoZSBtYWNyb3MgdG8uXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncykge1xuICB2YXIgY3R4ID0gYXJncy5wb3AoKSxcbiAgICBvdXQgPSAnX2N0eC4nICsgY3R4ICsgJyA9IHt9O1xcbiAgdmFyIF9vdXRwdXQgPSBcIlwiO1xcbicsXG4gICAgcmVwbGFjZW1lbnRzID0gdXRpbHMubWFwKGFyZ3MsIGZ1bmN0aW9uIChhcmcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGV4OiBuZXcgUmVnRXhwKCdfY3R4LicgKyBhcmcubmFtZSwgJ2cnKSxcbiAgICAgICAgcmU6ICdfY3R4LicgKyBjdHggKyAnLicgKyBhcmcubmFtZVxuICAgICAgfTtcbiAgICB9KTtcblxuICAvLyBSZXBsYWNlIGFsbCBvY2N1cnJlbmNlcyBvZiBhbGwgbWFjcm9zIGluIHRoaXMgZmlsZSB3aXRoXG4gIC8vIHByb3BlciBuYW1lc3BhY2VkIGRlZmluaXRpb25zIGFuZCBjYWxsc1xuICB1dGlscy5lYWNoKGFyZ3MsIGZ1bmN0aW9uIChhcmcpIHtcbiAgICB2YXIgYyA9IGFyZy5jb21waWxlZDtcbiAgICB1dGlscy5lYWNoKHJlcGxhY2VtZW50cywgZnVuY3Rpb24gKHJlKSB7XG4gICAgICBjID0gYy5yZXBsYWNlKHJlLmV4LCByZS5yZSk7XG4gICAgfSk7XG4gICAgb3V0ICs9IGM7XG4gIH0pO1xuXG4gIHJldHVybiBvdXQ7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2ssIG9wdHMpIHtcbiAgdmFyIHBhcnNlRmlsZSA9IHJlcXVpcmUoJy4uL3N3aWcnKS5wYXJzZUZpbGUsXG4gICAgY29tcGlsZXIgPSByZXF1aXJlKCcuLi9wYXJzZXInKS5jb21waWxlLFxuICAgIHBhcnNlT3B0cyA9IHsgcmVzb2x2ZUZyb206IG9wdHMuZmlsZW5hbWUgfSxcbiAgICBjb21waWxlT3B0cyA9IHV0aWxzLmV4dGVuZCh7fSwgb3B0cywgcGFyc2VPcHRzKSxcbiAgICB0b2tlbnMsXG4gICAgY3R4O1xuXG4gIHBhcnNlci5vbih0eXBlcy5TVFJJTkcsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXRva2Vucykge1xuICAgICAgdG9rZW5zID0gcGFyc2VGaWxlKHRva2VuLm1hdGNoLnJlcGxhY2UoL14oXCJ8Jyl8KFwifCcpJC9nLCAnJyksIHBhcnNlT3B0cykudG9rZW5zO1xuICAgICAgdXRpbHMuZWFjaCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICB2YXIgb3V0ID0gJycsXG4gICAgICAgICAgbWFjcm9OYW1lO1xuICAgICAgICBpZiAoIXRva2VuIHx8IHRva2VuLm5hbWUgIT09ICdtYWNybycgfHwgIXRva2VuLmNvbXBpbGUpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbWFjcm9OYW1lID0gdG9rZW4uYXJnc1swXTtcbiAgICAgICAgb3V0ICs9IHRva2VuLmNvbXBpbGUoY29tcGlsZXIsIHRva2VuLmFyZ3MsIHRva2VuLmNvbnRlbnQsIFtdLCBjb21waWxlT3B0cykgKyAnXFxuJztcbiAgICAgICAgc2VsZi5vdXQucHVzaCh7Y29tcGlsZWQ6IG91dCwgbmFtZTogbWFjcm9OYW1lfSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgc3RyaW5nICcgKyB0b2tlbi5tYXRjaCArICcgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXRva2VucyB8fCBjdHgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB2YXJpYWJsZSBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG5cbiAgICBpZiAodG9rZW4ubWF0Y2ggPT09ICdhcycpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjdHggPSB0b2tlbi5tYXRjaDtcbiAgICBzZWxmLm91dC5wdXNoKGN0eCk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuYmxvY2sgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2ltcG9ydC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlnbm9yZSA9ICdpZ25vcmUnLFxuICBtaXNzaW5nID0gJ21pc3NpbmcnLFxuICBvbmx5ID0gJ29ubHknO1xuXG4vKipcbiAqIEluY2x1ZGVzIGEgdGVtcGxhdGUgcGFydGlhbCBpbiBwbGFjZS4gVGhlIHRlbXBsYXRlIGlzIHJlbmRlcmVkIHdpdGhpbiB0aGUgY3VycmVudCBsb2NhbHMgdmFyaWFibGUgY29udGV4dC5cbiAqXG4gKiBAYWxpYXMgaW5jbHVkZVxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBmb29kID0gJ2J1cnJpdG9zJztcbiAqIC8vIGRyaW5rID0gJ2xlbW9uYWRlJztcbiAqIHslIGluY2x1ZGUgXCIuL3BhcnRpYWwuaHRtbFwiICV9XG4gKiAvLyA9PiBJIGxpa2UgYnVycml0b3MgYW5kIGxlbW9uYWRlLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9vYmogPSB7IGZvb2Q6ICd0YWNvcycsIGRyaW5rOiAnaG9yY2hhdGEnIH07XG4gKiB7JSBpbmNsdWRlIFwiLi9wYXJ0aWFsLmh0bWxcIiB3aXRoIG15X29iaiBvbmx5ICV9XG4gKiAvLyA9PiBJIGxpa2UgdGFjb3MgYW5kIGhvcmNoYXRhLlxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpbmNsdWRlIFwiL3RoaXMvZmlsZS9kb2VzL25vdC9leGlzdFwiIGlnbm9yZSBtaXNzaW5nICV9XG4gKiAvLyA9PiAoTm90aGluZyEgZW1wdHkgc3RyaW5nKVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfHZhcn0gIGZpbGUgICAgICBUaGUgcGF0aCwgcmVsYXRpdmUgdG8gdGhlIHRlbXBsYXRlIHJvb3QsIHRvIHJlbmRlciBpbnRvIHRoZSBjdXJyZW50IGNvbnRleHQuXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICAgICBbd2l0aF0gICAgTGl0ZXJhbGx5LCBcIndpdGhcIi5cbiAqIEBwYXJhbSB7b2JqZWN0fSAgICAgIFtjb250ZXh0XSBMb2NhbCB2YXJpYWJsZSBrZXktdmFsdWUgb2JqZWN0IGNvbnRleHQgdG8gcHJvdmlkZSB0byB0aGUgaW5jbHVkZWQgZmlsZS5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gICAgIFtvbmx5XSAgICBSZXN0cmljdHMgdG8gPHN0cm9uZz5vbmx5PC9zdHJvbmc+IHBhc3NpbmcgdGhlIDxjb2RlPndpdGggY29udGV4dDwvY29kZT4gYXMgbG9jYWwgdmFyaWFibGVz4oCTdGhlIGluY2x1ZGVkIHRlbXBsYXRlIHdpbGwgbm90IGJlIGF3YXJlIG9mIGFueSBvdGhlciBsb2NhbCB2YXJpYWJsZXMgaW4gdGhlIHBhcmVudCB0ZW1wbGF0ZS4gRm9yIGJlc3QgcGVyZm9ybWFuY2UsIHVzYWdlIG9mIHRoaXMgb3B0aW9uIGlzIHJlY29tbWVuZGVkIGlmIHBvc3NpYmxlLlxuICogQHBhcmFtIHtsaXRlcmFsfSAgICAgW2lnbm9yZSBtaXNzaW5nXSBXaWxsIG91dHB1dCBlbXB0eSBzdHJpbmcgaWYgbm90IGZvdW5kIGluc3RlYWQgb2YgdGhyb3dpbmcgYW4gZXJyb3IuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncykge1xuICB2YXIgZmlsZSA9IGFyZ3Muc2hpZnQoKSxcbiAgICBvbmx5SWR4ID0gYXJncy5pbmRleE9mKG9ubHkpLFxuICAgIG9ubHlDdHggPSBvbmx5SWR4ICE9PSAtMSA/IGFyZ3Muc3BsaWNlKG9ubHlJZHgsIDEpIDogZmFsc2UsXG4gICAgcGFyZW50RmlsZSA9IChhcmdzLnBvcCgpIHx8ICcnKS5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLFxuICAgIGlnbm9yZSA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gbWlzc2luZyA/IChhcmdzLnBvcCgpKSA6IGZhbHNlLFxuICAgIHcgPSBhcmdzLmpvaW4oJycpO1xuXG4gIHJldHVybiAoaWdub3JlID8gJyAgdHJ5IHtcXG4nIDogJycpICtcbiAgICAnX291dHB1dCArPSBfc3dpZy5jb21waWxlRmlsZSgnICsgZmlsZSArICcsIHsnICtcbiAgICAncmVzb2x2ZUZyb206IFwiJyArIHBhcmVudEZpbGUgKyAnXCInICtcbiAgICAnfSkoJyArXG4gICAgKChvbmx5Q3R4ICYmIHcpID8gdyA6ICghdyA/ICdfY3R4JyA6ICdfdXRpbHMuZXh0ZW5kKHt9LCBfY3R4LCAnICsgdyArICcpJykpICtcbiAgICAnKTtcXG4nICtcbiAgICAoaWdub3JlID8gJ30gY2F0Y2ggKGUpIHt9XFxuJyA6ICcnKTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjaywgb3B0cykge1xuICB2YXIgZmlsZSwgdztcbiAgcGFyc2VyLm9uKHR5cGVzLlNUUklORywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBmaWxlID0gdG9rZW4ubWF0Y2g7XG4gICAgICB0aGlzLm91dC5wdXNoKGZpbGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIGZpbGUgPSB0b2tlbi5tYXRjaDtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICghdyAmJiB0b2tlbi5tYXRjaCA9PT0gJ3dpdGgnKSB7XG4gICAgICB3ID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodyAmJiB0b2tlbi5tYXRjaCA9PT0gb25seSAmJiB0aGlzLnByZXZUb2tlbi5tYXRjaCAhPT0gJ3dpdGgnKSB7XG4gICAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodG9rZW4ubWF0Y2ggPT09IGlnbm9yZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmICh0b2tlbi5tYXRjaCA9PT0gbWlzc2luZykge1xuICAgICAgaWYgKHRoaXMucHJldlRva2VuLm1hdGNoICE9PSBpZ25vcmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHRva2VuIFwiJyArIG1pc3NpbmcgKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5wcmV2VG9rZW4ubWF0Y2ggPT09IGlnbm9yZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBcIicgKyBtaXNzaW5nICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnIGJ1dCBmb3VuZCBcIicgKyB0b2tlbi5tYXRjaCArICdcIi4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKCdlbmQnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5vdXQucHVzaChvcHRzLmZpbGVuYW1lIHx8IG51bGwpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW5jbHVkZS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuZXhwb3J0cy5hdXRvZXNjYXBlID0gcmVxdWlyZSgnLi9hdXRvZXNjYXBlJyk7XG5leHBvcnRzLmJsb2NrID0gcmVxdWlyZSgnLi9ibG9jaycpO1xuZXhwb3J0c1tcImVsc2VcIl0gPSByZXF1aXJlKCcuL2Vsc2UnKTtcbmV4cG9ydHMuZWxzZWlmID0gcmVxdWlyZSgnLi9lbHNlaWYnKTtcbmV4cG9ydHMuZWxpZiA9IGV4cG9ydHMuZWxzZWlmO1xuZXhwb3J0c1tcImV4dGVuZHNcIl0gPSByZXF1aXJlKCcuL2V4dGVuZHMnKTtcbmV4cG9ydHMuZmlsdGVyID0gcmVxdWlyZSgnLi9maWx0ZXInKTtcbmV4cG9ydHNbXCJmb3JcIl0gPSByZXF1aXJlKCcuL2ZvcicpO1xuZXhwb3J0c1tcImlmXCJdID0gcmVxdWlyZSgnLi9pZicpO1xuZXhwb3J0c1tcImltcG9ydFwiXSA9IHJlcXVpcmUoJy4vaW1wb3J0Jyk7XG5leHBvcnRzLmluY2x1ZGUgPSByZXF1aXJlKCcuL2luY2x1ZGUnKTtcbmV4cG9ydHMubWFjcm8gPSByZXF1aXJlKCcuL21hY3JvJyk7XG5leHBvcnRzLnBhcmVudCA9IHJlcXVpcmUoJy4vcGFyZW50Jyk7XG5leHBvcnRzLnJhdyA9IHJlcXVpcmUoJy4vcmF3Jyk7XG5leHBvcnRzLnNldCA9IHJlcXVpcmUoJy4vc2V0Jyk7XG5leHBvcnRzLnNwYWNlbGVzcyA9IHJlcXVpcmUoJy4vc3BhY2VsZXNzJyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogQ3JlYXRlIGN1c3RvbSwgcmV1c2FibGUgc25pcHBldHMgd2l0aGluIHlvdXIgdGVtcGxhdGVzLlxuICogQ2FuIGJlIGltcG9ydGVkIGZyb20gb25lIHRlbXBsYXRlIHRvIGFub3RoZXIgdXNpbmcgdGhlIDxhIGhyZWY9XCIjaW1wb3J0XCI+PGNvZGUgZGF0YS1sYW5ndWFnZT1cInN3aWdcIj57JSBpbXBvcnQgLi4uICV9PC9jb2RlPjwvYT4gdGFnLlxuICpcbiAqIEBhbGlhcyBtYWNyb1xuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBtYWNybyBpbnB1dCh0eXBlLCBuYW1lLCBpZCwgbGFiZWwsIHZhbHVlLCBlcnJvcikgJX1cbiAqICAgPGxhYmVsIGZvcj1cInt7IG5hbWUgfX1cIj57eyBsYWJlbCB9fTwvbGFiZWw+XG4gKiAgIDxpbnB1dCB0eXBlPVwie3sgdHlwZSB9fVwiIG5hbWU9XCJ7eyBuYW1lIH19XCIgaWQ9XCJ7eyBpZCB9fVwiIHZhbHVlPVwie3sgdmFsdWUgfX1cInslIGlmIGVycm9yICV9IGNsYXNzPVwiZXJyb3JcInslIGVuZGlmICV9PlxuICogeyUgZW5kbWFjcm8gJX1cbiAqXG4gKiB7eyBpbnB1dChcInRleHRcIiwgXCJmbmFtZVwiLCBcImZuYW1lXCIsIFwiRmlyc3QgTmFtZVwiLCBmbmFtZS52YWx1ZSwgZm5hbWUuZXJyb3JzKSB9fVxuICogLy8gPT4gPGxhYmVsIGZvcj1cImZuYW1lXCI+Rmlyc3QgTmFtZTwvbGFiZWw+XG4gKiAvLyAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBuYW1lPVwiZm5hbWVcIiBpZD1cImZuYW1lXCIgdmFsdWU9XCJcIj5cbiAqXG4gKiBAcGFyYW0gey4uLmFyZ3VtZW50c30gYXJndW1lbnRzICBVc2VyLWRlZmluZWQgYXJndW1lbnRzLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICB2YXIgZm5OYW1lID0gYXJncy5zaGlmdCgpO1xuXG4gIHJldHVybiAnX2N0eC4nICsgZm5OYW1lICsgJyA9IGZ1bmN0aW9uICgnICsgYXJncy5qb2luKCcnKSArICcpIHtcXG4nICtcbiAgICAnICB2YXIgX291dHB1dCA9IFwiXCI7XFxuJyArXG4gICAgY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSArICdcXG4nICtcbiAgICAnICByZXR1cm4gX291dHB1dDtcXG4nICtcbiAgICAnfTtcXG4nICtcbiAgICAnX2N0eC4nICsgZm5OYW1lICsgJy5zYWZlID0gdHJ1ZTtcXG4nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMpIHtcbiAgdmFyIG5hbWU7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHRva2VuLm1hdGNoLmluZGV4T2YoJy4nKSAhPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBkb3QgaW4gbWFjcm8gYXJndW1lbnQgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuRlVOQ1RJT04sIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghbmFtZSkge1xuICAgICAgbmFtZSA9IHRva2VuLm1hdGNoO1xuICAgICAgdGhpcy5vdXQucHVzaChuYW1lKTtcbiAgICAgIHRoaXMuc3RhdGUucHVzaCh0eXBlcy5GVU5DVElPTik7XG4gICAgfVxuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuRlVOQ1RJT05FTVBUWSwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFuYW1lKSB7XG4gICAgICBuYW1lID0gdG9rZW4ubWF0Y2g7XG4gICAgICB0aGlzLm91dC5wdXNoKG5hbWUpO1xuICAgIH1cbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlBBUkVOQ0xPU0UsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5pc0xhc3QpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHBhcmVudGhlc2lzIGNsb3NlIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQ09NTUEsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybjtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuZXhwb3J0cy5ibG9jayA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvbWFjcm8uanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogSW5qZWN0IHRoZSBjb250ZW50IGZyb20gdGhlIHBhcmVudCB0ZW1wbGF0ZSdzIGJsb2NrIG9mIHRoZSBzYW1lIG5hbWUgaW50byB0aGUgY3VycmVudCBibG9jay5cbiAqXG4gKiBTZWUgPGEgaHJlZj1cIiNpbmhlcml0YW5jZVwiPlRlbXBsYXRlIEluaGVyaXRhbmNlPC9hPiBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cbiAqXG4gKiBAYWxpYXMgcGFyZW50XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGV4dGVuZHMgXCIuL2Zvby5odG1sXCIgJX1cbiAqIHslIGJsb2NrIGNvbnRlbnQgJX1cbiAqICAgTXkgY29udGVudC5cbiAqICAgeyUgcGFyZW50ICV9XG4gKiB7JSBlbmRibG9jayAlfVxuICpcbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgaWYgKCFwYXJlbnRzIHx8ICFwYXJlbnRzLmxlbmd0aCkge1xuICAgIHJldHVybiAnJztcbiAgfVxuXG4gIHZhciBwYXJlbnRGaWxlID0gYXJnc1swXSxcbiAgICBicmVha2VyID0gdHJ1ZSxcbiAgICBsID0gcGFyZW50cy5sZW5ndGgsXG4gICAgaSA9IDAsXG4gICAgcGFyZW50LFxuICAgIGJsb2NrO1xuXG4gIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgIHBhcmVudCA9IHBhcmVudHNbaV07XG4gICAgaWYgKCFwYXJlbnQuYmxvY2tzIHx8ICFwYXJlbnQuYmxvY2tzLmhhc093blByb3BlcnR5KGJsb2NrTmFtZSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBTaWxseSBKU0xpbnQgXCJTdHJhbmdlIExvb3BcIiByZXF1aXJlcyByZXR1cm4gdG8gYmUgaW4gYSBjb25kaXRpb25hbFxuICAgIGlmIChicmVha2VyICYmIHBhcmVudEZpbGUgIT09IHBhcmVudC5uYW1lKSB7XG4gICAgICBibG9jayA9IHBhcmVudC5ibG9ja3NbYmxvY2tOYW1lXTtcbiAgICAgIHJldHVybiBibG9jay5jb21waWxlKGNvbXBpbGVyLCBbYmxvY2tOYW1lXSwgYmxvY2suY29udGVudCwgcGFyZW50cy5zbGljZShpICsgMSksIG9wdGlvbnMpICsgJ1xcbic7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2ssIG9wdHMpIHtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGFyZ3VtZW50IFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcblxuICBwYXJzZXIub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLm91dC5wdXNoKG9wdHMuZmlsZW5hbWUpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvcGFyZW50LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vLyBNYWdpYyB0YWcsIGhhcmRjb2RlZCBpbnRvIHBhcnNlclxuXG4vKipcbiAqIEZvcmNlcyB0aGUgY29udGVudCB0byBub3QgYmUgYXV0by1lc2NhcGVkLiBBbGwgc3dpZyBpbnN0cnVjdGlvbnMgd2lsbCBiZSBpZ25vcmVkIGFuZCB0aGUgY29udGVudCB3aWxsIGJlIHJlbmRlcmVkIGV4YWN0bHkgYXMgaXQgd2FzIGdpdmVuLlxuICpcbiAqIEBhbGlhcyByYXdcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gZm9vYmFyID0gJzxwPidcbiAqIHslIHJhdyAlfXt7IGZvb2JhciB9fXslIGVuZHJhdyAlfVxuICogLy8gPT4ge3sgZm9vYmFyIH19XG4gKlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICByZXR1cm4gY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKTtcbn07XG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyKSB7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB0b2tlbiBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBpbiByYXcgdGFnIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcbiAgcmV0dXJuIHRydWU7XG59O1xuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9yYXcuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qKlxuICogU2V0IGEgdmFyaWFibGUgZm9yIHJlLXVzZSBpbiB0aGUgY3VycmVudCBjb250ZXh0LiBUaGlzIHdpbGwgb3Zlci13cml0ZSBhbnkgdmFsdWUgYWxyZWFkeSBzZXQgdG8gdGhlIGNvbnRleHQgZm9yIHRoZSBnaXZlbiA8dmFyPnZhcm5hbWU8L3Zhcj4uXG4gKlxuICogQGFsaWFzIHNldFxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBzZXQgZm9vID0gXCJhbnl0aGluZyFcIiAlfVxuICoge3sgZm9vIH19XG4gKiAvLyA9PiBhbnl0aGluZyFcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gaW5kZXggPSAyO1xuICogeyUgc2V0IGJhciA9IDEgJX1cbiAqIHslIHNldCBiYXIgKz0gaW5kZXh8ZGVmYXVsdCgzKSAlfVxuICogLy8gPT4gM1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBmb29kcyA9IHt9O1xuICogLy8gZm9vZCA9ICdjaGlsaSc7XG4gKiB7JSBzZXQgZm9vZHNbZm9vZF0gPSBcImNvbiBxdWVzb1wiICV9XG4gKiB7eyBmb29kcy5jaGlsaSB9fVxuICogLy8gPT4gY29uIHF1ZXNvXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGZvb2RzID0geyBjaGlsaTogJ2NoaWxpIGNvbiBxdWVzbycgfVxuICogeyUgc2V0IGZvb2RzLmNoaWxpID0gXCJndWF0YW1hbGFuIGluc2FuaXR5IHBlcHBlclwiICV9XG4gKiB7eyBmb29kcy5jaGlsaSB9fVxuICogLy8gPT4gZ3VhdGFtYWxhbiBpbnNhbml0eSBwZXBwZXJcbiAqXG4gKiBAcGFyYW0ge2xpdGVyYWx9IHZhcm5hbWUgICBUaGUgdmFyaWFibGUgbmFtZSB0byBhc3NpZ24gdGhlIHZhbHVlIHRvLlxuICogQHBhcmFtIHtsaXRlcmFsfSBhc3NpZ25lbWVudCAgIEFueSB2YWxpZCBKYXZhU2NyaXB0IGFzc2lnbmVtZW50LiA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj49LCArPSwgKj0sIC89LCAtPTwvY29kZT5cbiAqIEBwYXJhbSB7Kn0gICB2YWx1ZSAgICAgVmFsaWQgdmFyaWFibGUgb3V0cHV0LlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MpIHtcbiAgcmV0dXJuIGFyZ3Muam9pbignICcpICsgJztcXG4nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMpIHtcbiAgdmFyIG5hbWVTZXQgPSAnJyxcbiAgICBwcm9wZXJ0eU5hbWU7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHByb3BlcnR5TmFtZSkge1xuICAgICAgLy8gVGVsbCB0aGUgcGFyc2VyIHdoZXJlIHRvIGZpbmQgdGhlIHZhcmlhYmxlXG4gICAgICBwcm9wZXJ0eU5hbWUgKz0gJ19jdHguJyArIHRva2VuLm1hdGNoO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghcGFyc2VyLm91dC5sZW5ndGgpIHtcbiAgICAgIG5hbWVTZXQgKz0gdG9rZW4ubWF0Y2g7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5CUkFDS0VUT1BFTiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFwcm9wZXJ0eU5hbWUgJiYgIXRoaXMub3V0Lmxlbmd0aCkge1xuICAgICAgcHJvcGVydHlOYW1lID0gdG9rZW4ubWF0Y2g7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5TVFJJTkcsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmIChwcm9wZXJ0eU5hbWUgJiYgIXRoaXMub3V0Lmxlbmd0aCkge1xuICAgICAgcHJvcGVydHlOYW1lICs9IHRva2VuLm1hdGNoO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQlJBQ0tFVENMT1NFLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAocHJvcGVydHlOYW1lICYmICF0aGlzLm91dC5sZW5ndGgpIHtcbiAgICAgIG5hbWVTZXQgKz0gcHJvcGVydHlOYW1lICsgdG9rZW4ubWF0Y2g7XG4gICAgICBwcm9wZXJ0eU5hbWUgPSB1bmRlZmluZWQ7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5ET1RLRVksIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghcHJvcGVydHlOYW1lICYmICFuYW1lU2V0KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbmFtZVNldCArPSAnLicgKyB0b2tlbi5tYXRjaDtcbiAgICByZXR1cm47XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5BU1NJR05NRU5ULCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAodGhpcy5vdXQubGVuZ3RoIHx8ICFuYW1lU2V0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgYXNzaWdubWVudCBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG5cbiAgICB0aGlzLm91dC5wdXNoKFxuICAgICAgLy8gUHJldmVudCB0aGUgc2V0IGZyb20gc3BpbGxpbmcgaW50byBnbG9iYWwgc2NvcGVcbiAgICAgICdfY3R4LicgKyBuYW1lU2V0XG4gICAgKTtcbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmJsb2NrID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9zZXQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogQXR0ZW1wdHMgdG8gcmVtb3ZlIHdoaXRlc3BhY2UgYmV0d2VlbiBIVE1MIHRhZ3MuIFVzZSBhdCB5b3VyIG93biByaXNrLlxuICpcbiAqIEBhbGlhcyBzcGFjZWxlc3NcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgc3BhY2VsZXNzICV9XG4gKiAgIHslIGZvciBudW0gaW4gZm9vICV9XG4gKiAgIDxsaT57eyBsb29wLmluZGV4IH19PC9saT5cbiAqICAgeyUgZW5kZm9yICV9XG4gKiB7JSBlbmRzcGFjZWxlc3MgJX1cbiAqIC8vID0+IDxsaT4xPC9saT48bGk+MjwvbGk+PGxpPjM8L2xpPlxuICpcbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgZnVuY3Rpb24gc3RyaXBXaGl0ZXNwYWNlKHRva2Vucykge1xuICAgIHJldHVybiB1dGlscy5tYXAodG9rZW5zLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgIGlmICh0b2tlbi5jb250ZW50IHx8IHR5cGVvZiB0b2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdG9rZW4uY29udGVudCA9IHN0cmlwV2hpdGVzcGFjZSh0b2tlbi5jb250ZW50KTtcbiAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdG9rZW4ucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgICAgLnJlcGxhY2UoLz5cXHMrPC9nLCAnPjwnKVxuICAgICAgICAucmVwbGFjZSgvXFxzKyQvLCAnJyk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gY29tcGlsZXIoc3RyaXBXaGl0ZXNwYWNlKGNvbnRlbnQpLCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlcikge1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdG9rZW4gXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9zcGFjZWxlc3MuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBpc0FycmF5O1xuXG4vKipcbiAqIFN0cmlwIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UgZnJvbSBhIHN0cmluZy5cbiAqIEBwYXJhbSAge3N0cmluZ30gaW5wdXRcbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgU3RyaXBwZWQgaW5wdXQuXG4gKi9cbmV4cG9ydHMuc3RyaXAgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbn07XG5cbi8qKlxuICogVGVzdCBpZiBhIHN0cmluZyBzdGFydHMgd2l0aCBhIGdpdmVuIHByZWZpeC5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3RyICAgIFN0cmluZyB0byB0ZXN0IGFnYWluc3QuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHByZWZpeCBQcmVmaXggdG8gY2hlY2sgZm9yLlxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0cy5zdGFydHNXaXRoID0gZnVuY3Rpb24gKHN0ciwgcHJlZml4KSB7XG4gIHJldHVybiBzdHIuaW5kZXhPZihwcmVmaXgpID09PSAwO1xufTtcblxuLyoqXG4gKiBUZXN0IGlmIGEgc3RyaW5nIGVuZHMgd2l0aCBhIGdpdmVuIHN1ZmZpeC5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3RyICAgIFN0cmluZyB0byB0ZXN0IGFnYWluc3QuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN1ZmZpeCBTdWZmaXggdG8gY2hlY2sgZm9yLlxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0cy5lbmRzV2l0aCA9IGZ1bmN0aW9uIChzdHIsIHN1ZmZpeCkge1xuICByZXR1cm4gc3RyLmluZGV4T2Yoc3VmZml4LCBzdHIubGVuZ3RoIC0gc3VmZml4Lmxlbmd0aCkgIT09IC0xO1xufTtcblxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgYW4gYXJyYXkgb3Igb2JqZWN0LlxuICogQHBhcmFtICB7YXJyYXl8b2JqZWN0fSBvYmogRW51bWVyYWJsZSBvYmplY3QuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICBDYWxsYmFjayBmdW5jdGlvbiBleGVjdXRlZCBmb3IgZWFjaCBpdGVtLlxuICogQHJldHVybiB7YXJyYXl8b2JqZWN0fSAgICAgVGhlIG9yaWdpbmFsIGlucHV0IG9iamVjdC5cbiAqL1xuZXhwb3J0cy5lYWNoID0gZnVuY3Rpb24gKG9iaiwgZm4pIHtcbiAgdmFyIGksIGw7XG5cbiAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgIGkgPSAwO1xuICAgIGwgPSBvYmoubGVuZ3RoO1xuICAgIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgICAgaWYgKGZuKG9ialtpXSwgaSwgb2JqKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgaWYgKGZuKG9ialtpXSwgaSwgb2JqKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59O1xuXG4vKipcbiAqIFRlc3QgaWYgYW4gb2JqZWN0IGlzIGFuIEFycmF5LlxuICogQHBhcmFtIHtvYmplY3R9IG9ialxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheSA9IChBcnJheS5oYXNPd25Qcm9wZXJ0eSgnaXNBcnJheScpKSA/IEFycmF5LmlzQXJyYXkgOiBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiAob2JqKSA/ICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKS5pbmRleE9mKCkgIT09IC0xKSA6IGZhbHNlO1xufTtcblxuLyoqXG4gKiBUZXN0IGlmIGFuIGl0ZW0gaW4gYW4gZW51bWVyYWJsZSBtYXRjaGVzIHlvdXIgY29uZGl0aW9ucy5cbiAqIEBwYXJhbSAge2FycmF5fG9iamVjdH0gICBvYmogICBFbnVtZXJhYmxlIG9iamVjdC5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgICBmbiAgICBFeGVjdXRlZCBmb3IgZWFjaCBpdGVtLiBSZXR1cm4gdHJ1ZSBpZiB5b3VyIGNvbmRpdGlvbiBpcyBtZXQuXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5leHBvcnRzLnNvbWUgPSBmdW5jdGlvbiAob2JqLCBmbikge1xuICB2YXIgaSA9IDAsXG4gICAgcmVzdWx0LFxuICAgIGw7XG4gIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICBsID0gb2JqLmxlbmd0aDtcblxuICAgIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgICAgcmVzdWx0ID0gZm4ob2JqW2ldLCBpLCBvYmopO1xuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZXhwb3J0cy5lYWNoKG9iaiwgZnVuY3Rpb24gKHZhbHVlLCBpbmRleCkge1xuICAgICAgcmVzdWx0ID0gZm4odmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgcmV0dXJuICEocmVzdWx0KTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gISFyZXN1bHQ7XG59O1xuXG4vKipcbiAqIFJldHVybiBhIG5ldyBlbnVtZXJhYmxlLCBtYXBwZWQgYnkgYSBnaXZlbiBpdGVyYXRpb24gZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtvYmplY3R9ICAgb2JqIEVudW1lcmFibGUgb2JqZWN0LlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICBFeGVjdXRlZCBmb3IgZWFjaCBpdGVtLiBSZXR1cm4gdGhlIGl0ZW0gdG8gcmVwbGFjZSB0aGUgb3JpZ2luYWwgaXRlbSB3aXRoLlxuICogQHJldHVybiB7b2JqZWN0fSAgICAgICBOZXcgbWFwcGVkIG9iamVjdC5cbiAqL1xuZXhwb3J0cy5tYXAgPSBmdW5jdGlvbiAob2JqLCBmbikge1xuICB2YXIgaSA9IDAsXG4gICAgcmVzdWx0ID0gW10sXG4gICAgbDtcblxuICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgbCA9IG9iai5sZW5ndGg7XG4gICAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgICByZXN1bHRbaV0gPSBmbihvYmpbaV0sIGkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGkpKSB7XG4gICAgICAgIHJlc3VsdFtpXSA9IGZuKG9ialtpXSwgaSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIENvcHkgYWxsIG9mIHRoZSBwcm9wZXJ0aWVzIGluIHRoZSBzb3VyY2Ugb2JqZWN0cyBvdmVyIHRvIHRoZSBkZXN0aW5hdGlvbiBvYmplY3QsIGFuZCByZXR1cm4gdGhlIGRlc3RpbmF0aW9uIG9iamVjdC4gSXQncyBpbi1vcmRlciwgc28gdGhlIGxhc3Qgc291cmNlIHdpbGwgb3ZlcnJpZGUgcHJvcGVydGllcyBvZiB0aGUgc2FtZSBuYW1lIGluIHByZXZpb3VzIGFyZ3VtZW50cy5cbiAqIEBwYXJhbSB7Li4ub2JqZWN0fSBhcmd1bWVudHNcbiAqIEByZXR1cm4ge29iamVjdH1cbiAqL1xuZXhwb3J0cy5leHRlbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzLFxuICAgIHRhcmdldCA9IGFyZ3NbMF0sXG4gICAgb2JqcyA9IChhcmdzLmxlbmd0aCA+IDEpID8gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJncywgMSkgOiBbXSxcbiAgICBpID0gMCxcbiAgICBsID0gb2Jqcy5sZW5ndGgsXG4gICAga2V5LFxuICAgIG9iajtcblxuICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICBvYmogPSBvYmpzW2ldIHx8IHt9O1xuICAgIGZvciAoa2V5IGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHRhcmdldFtrZXldID0gb2JqW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXQ7XG59O1xuXG4vKipcbiAqIEdldCBhbGwgb2YgdGhlIGtleXMgb24gYW4gb2JqZWN0LlxuICogQHBhcmFtICB7b2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge2FycmF5fVxuICovXG5leHBvcnRzLmtleXMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIGlmICghb2JqKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaik7XG4gIH1cblxuICByZXR1cm4gZXhwb3J0cy5tYXAob2JqLCBmdW5jdGlvbiAodiwgaykge1xuICAgIHJldHVybiBrO1xuICB9KTtcbn07XG5cbi8qKlxuICogVGhyb3cgYW4gZXJyb3Igd2l0aCBwb3NzaWJsZSBsaW5lIG51bWJlciBhbmQgc291cmNlIGZpbGUuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IG1lc3NhZ2UgRXJyb3IgbWVzc2FnZVxuICogQHBhcmFtICB7bnVtYmVyfSBbbGluZV0gIExpbmUgbnVtYmVyIGluIHRlbXBsYXRlLlxuICogQHBhcmFtICB7c3RyaW5nfSBbZmlsZV0gIFRlbXBsYXRlIGZpbGUgdGhlIGVycm9yIG9jY3VyZWQgaW4uXG4gKiBAdGhyb3dzIHtFcnJvcn0gTm8gc2VyaW91c2x5LCB0aGUgcG9pbnQgaXMgdG8gdGhyb3cgYW4gZXJyb3IuXG4gKi9cbmV4cG9ydHMudGhyb3dFcnJvciA9IGZ1bmN0aW9uIChtZXNzYWdlLCBsaW5lLCBmaWxlKSB7XG4gIGlmIChsaW5lKSB7XG4gICAgbWVzc2FnZSArPSAnIG9uIGxpbmUgJyArIGxpbmU7XG4gIH1cbiAgaWYgKGZpbGUpIHtcbiAgICBtZXNzYWdlICs9ICcgaW4gZmlsZSAnICsgZmlsZTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSArICcuJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi91dGlscy5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbndpbmRvdy5vbmxvYWQgPSBmdW5jdGlvbigpe1xuICB2YXIgc2l0ZSA9IHtcbiAgICBpbml0IDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbiAgICAgIHZhciBtaWNyb0FqYXggPSByZXF1aXJlKCcuL21pY3JvYWpheCcpO1xuICAgICAgdmFyIHB1YnN1YiA9IHJlcXVpcmUoJy4vcHVic3ViJyk7XG4gICAgICB2YXIgc3dpZyAgPSByZXF1aXJlKCdzd2lnJyk7XG4gICAgICB2YXIgYXBwID0ge1xuICAgICAgICAnaGVscCcgOiBoZWxwZXJzLFxuICAgICAgICAnYWpheCcgOiBtaWNyb0FqYXgsXG4gICAgICAgICdwdWJsaXNoJyA6IHB1YnN1Yi5wdWJsaXNoLFxuICAgICAgICAnc3Vic2NyaWJlJyA6IHB1YnN1Yi5zdWJzY3JpYmUsXG4gICAgICAgICd1bnN1YnNjcmliZScgOiBwdWJzdWIudW5zdWJzY3JpYmUsXG4gICAgICAgICdyZW5kZXInIDogc3dpZy5ydW4sXG4gICAgICAgICdwcmVjb21waWxlJyA6IHN3aWcucHJlY29tcGlsZVxuICAgICAgfSxcbiAgICAgIGRvbSA9IHtcbiAgICAgICAgJ292ZXJsYXlDbG9zZScgOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZlcmxheS1jbG9zZScpLFxuICAgICAgICAnb3ZlcmxheUNvbnRlbnQnIDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXJsYXktY29udGVudCcpXG4gICAgICB9XG4gICAgICBzaXRlLmV2ZW50cyhhcHAsIGRvbSk7XG4gICAgfSxcbiAgICBldmVudHMgOiBmdW5jdGlvbiAoYXBwLCBkb20pIHtcblxuICAgICAgYXBwLmhlbHAuYWRkRXZlbnRMaXN0ZW5lckJ5Q2xhc3MoJ292ZXJsYXktdHJpZ2dlcicsICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGFwcC5wdWJsaXNoKCcvZXZlbnQvcmVnaXN0ZXIvc3VibWl0JywgdHJ1ZSk7XG4gICAgICAgIGFwcC5hamF4KHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyAnL2ZyYWdtZW50cy9yZWdpc3RlcicsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICBhcHAucHVibGlzaCgnL3ZpZXcvcmVnaXN0ZXIvc3VjY2VzcycsIHRydWUpO1xuICAgICAgICAgIGRvbS5vdmVybGF5Q29udGVudC5pbm5lckhUTUwgPSByZXM7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGFwcC5oZWxwLmFkZEV2ZW50TGlzdGVuZXJCeUNsYXNzKCdzaWduaW4tYnRuJywgJ2NsaWNrJywgZnVuY3Rpb24oZSl7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgYXBwLmhlbHAuYWRkQm9keUNsYXNzKCdvdmVybGF5LXZpc2libGUnKTtcbiAgICAgICAgYXBwLmFqYXgod2luZG93LmxvY2F0aW9uLm9yaWdpbiArICcvZnJhZ21lbnRzL3NpZ25pbicsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICBhcHAucHVibGlzaCgnL3ZpZXcvc2lnbmluL3N1Y2Nlc3MnLCB0cnVlKTtcbiAgICAgICAgICBkb20ub3ZlcmxheUNvbnRlbnQuaW5uZXJIVE1MID0gcmVzO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBkb20ub3ZlcmxheUNsb3NlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgICAgYXBwLmhlbHAucmVtb3ZlQm9keUNsYXNzKCdvdmVybGF5LXZpc2libGUnKTtcbiAgICAgICAgYXBwLnB1Ymxpc2goJy92aWV3L292ZXJsYXkvY2xvc2VkJywgdHJ1ZSk7XG4gICAgICB9KTtcblxuICAgICAgYXBwLnN1YnNjcmliZShcIi92aWV3L3JlZ2lzdGVyL3N1Y2Nlc3NcIiwgZnVuY3Rpb24oZmxhZyl7XG4gICAgICAgICAgaWYoZmxhZyA9PT0gdHJ1ZSl7XG4gICAgICAgICAgICBzaXRlLnBvc3RTaWdudXAoYXBwKTtcbiAgICAgICAgICAgIGFwcC5oZWxwLmFkZEV2ZW50TGlzdGVuZXJCeUNsYXNzKCdoZWxwJywgJ2NsaWNrJywgZnVuY3Rpb24oZSl7XG4gICAgICAgICAgICAgIGFwcC5oZWxwLnNob3dUb29sdGlwKGUsICdoZWxwLW1lc3NhZ2UnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBhcHAuc3Vic2NyaWJlKFwiL2Zvcm0vcmVnaXN0ZXIvdXBkYXRlXCIsIGZ1bmN0aW9uKGZsYWcpe1xuICAgICAgICAgIHZhciBidXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3JlYXRlLWFjY291bnQtYnV0dG9uJyk7XG4gICAgICAgICAgYXBwLmhlbHAubG9hZGluZyhidXR0b24sICdyZW1vdmUnKTtcbiAgICAgIH0pO1xuXG4gICAgICBhcHAuc3Vic2NyaWJlKFwiL2V2ZW50L3JlZ2lzdGVyL3N1Ym1pdFwiLCBmdW5jdGlvbigpe1xuICAgICAgICBhcHAuaGVscC5hZGRCb2R5Q2xhc3MoJ292ZXJsYXktdmlzaWJsZScpO1xuICAgICAgfSk7XG5cbiAgICAgIGFwcC5zdWJzY3JpYmUoXCIvbWVzc2FnZS9lcnJvclwiLCBmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlcnJvci13cmFwXCIpLmlubmVySFRNTCArPSBkYXRhLmh0bWw7XG4gICAgICB9KVxuICAgIH0sXG4gICAgcG9zdFNpZ251cCA6IGZ1bmN0aW9uKGFwcCl7XG4gICAgICB2YXIgc3VibWl0YWNjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtYWNjb3VudC1idXR0b24nKTtcbiAgICAgIHN1Ym1pdGFjY3QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbihlKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBhcHAuaGVscC5sb2FkaW5nKHN1Ym1pdGFjY3QpO1xuICAgICAgICB2YXIgc2lnbnVwRm9ybUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaWdudXBcIik7XG4gICAgICAgIHZhciBmb3JtRGF0YSA9IG5ldyBGb3JtRGF0YShzaWdudXBGb3JtRWwpO1xuICAgICAgICBhcHAuaGVscC5wb3N0Rm9ybShzaWdudXBGb3JtRWwsIGZ1bmN0aW9uKHhocil7XG4gICAgICAgICAgYXBwLmhlbHAucmVtb3ZlRWxlbWVudHNCeUNsYXNzKCdlcnJvcicpO1xuXG4gICAgICAgICAgdmFyIHJlcyA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgICBpZihyZXMuZXJyb3JzKXtcbiAgICAgICAgICAgIGFwcC5wdWJsaXNoKCcvZm9ybS9yZWdpc3Rlci91cGRhdGUnLCAnZmFpbCcpO1xuICAgICAgICAgICAgdmFyIHRwbCA9IGFwcC5wcmVjb21waWxlKCd7JSBmb3IgZXJyb3IgaW4gZXJyb3JzIHxyZXZlcnNlICV9PGRpdiBjbGFzcz1cImVycm9yXCI+e3sgZXJyb3IgfX08L2Rpdj57JSBlbmRmb3IgJX0nKS50cGxcbiAgICAgICAgICAgIHZhciB0ZW1wbGF0ZSA9IGFwcC5yZW5kZXIodHBsLCB7ICdlcnJvcnMnIDogcmVzLmVycm9ycyB9KTtcbiAgICAgICAgICAgIGFwcC5wdWJsaXNoKCcvbWVzc2FnZS9lcnJvcicsIHsgaHRtbCA6IHRlbXBsYXRlIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFwcC5wdWJsaXNoKCcvZm9ybS9yZWdpc3Rlci91cGRhdGUnLCAnc3VjY2VzcycpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzaXRlLmluaXQoKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZmFrZV80NDRhOTQ3Yy5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblxudmFyIGhlbHBlcnMgPSB7XG4gIGFkZEV2ZW50TGlzdGVuZXJCeUNsYXNzIDogZnVuY3Rpb24gKGNsYXNzTmFtZSwgZXZlbnQsIGZuKSB7XG4gICAgdmFyIGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKGNsYXNzTmFtZSk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGxpc3RbaV0uYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgZm4sIGZhbHNlKTtcbiAgICB9XG4gIH0sXG4gIGFkZEJvZHlDbGFzcyA6IGZ1bmN0aW9uIChjKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdib2R5JylbMF0uY2xhc3NOYW1lICs9JyAnK2M7XG4gIH0sXG4gIHJlbW92ZUJvZHlDbGFzcyA6IGZ1bmN0aW9uIChjKSB7XG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc05hbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYm9keScpWzBdLmNsYXNzTmFtZS5yZXBsYWNlKGMsXCJcIik7XG4gIH0sXG4gIHJlbW92ZUVsZW1lbnRzQnlDbGFzcyA6IGZ1bmN0aW9uIChjbGFzc05hbWUpIHtcbiAgICBlbGVtZW50cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoY2xhc3NOYW1lKTtcbiAgICB3aGlsZShlbGVtZW50cy5sZW5ndGggPiAwKXtcbiAgICAgICAgZWxlbWVudHNbMF0ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbGVtZW50c1swXSk7XG4gICAgfVxuICB9LFxuICBwb3N0Rm9ybSA6IGZ1bmN0aW9uKG9Gb3JtRWxlbWVudCwgY2Ipe1xuICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICB4aHIub25sb2FkID0gZnVuY3Rpb24oKXsgY2IoeGhyKSB9O1xuICAgIHhoci5vcGVuIChvRm9ybUVsZW1lbnQubWV0aG9kLCBvRm9ybUVsZW1lbnQuYWN0aW9uLCB0cnVlKTtcbiAgICB4aHIuc2VuZCAobmV3IEZvcm1EYXRhIChvRm9ybUVsZW1lbnQpKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG4gIHNob3dUb29sdGlwIDogZnVuY3Rpb24oZSwgdG9vbHRpcENsYXNzKSB7XG4gICAgdmFyIG1lc3NhZ2UgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEVsZW1lbnRzQnlDbGFzc05hbWUodG9vbHRpcENsYXNzKVswXTtcbiAgICBpZihtZXNzYWdlLmNsYXNzTmFtZS5pbmRleE9mKFwiYWN0aXZlXCIpID4gLTEpe1xuICAgICAgbWVzc2FnZS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWVzc2FnZS5jbGFzc05hbWUgKz0gJyBhY3RpdmUnO1xuICAgIH1cbiAgfSxcbiAgbG9hZGluZyA6IGZ1bmN0aW9uKHRhcmdldCwgdHlwZSl7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgICB2YXIgc3Bpbm5lciA9IHRhcmdldC5wYXJlbnROb2RlO1xuICAgIGlmKHNwaW5uZXIuY2xhc3NOYW1lLmluZGV4T2YoXCJhY3RpdmVcIikgPT0gLTEpe1xuICAgICAgc3Bpbm5lci5jbGFzc05hbWUgKz0gJyBhY3RpdmUnO1xuICAgIH1cbiAgICBpZih0eXBlID09PSAncmVtb3ZlJyl7XG4gICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgc3Bpbm5lci5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICAgIH0sIDEwMDApO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGhlbHBlcnM7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvaGVscGVycy5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qXG5Db3B5cmlnaHQgKGMpIDIwMDggU3RlZmFuIExhbmdlLUhlZ2VybWFublxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuXG5mdW5jdGlvbiBtaWNyb0FqYXgodXJsLCBjYWxsYmFja0Z1bmN0aW9uKVxue1xuXHR0aGlzLmJpbmRGdW5jdGlvbiA9IGZ1bmN0aW9uIChjYWxsZXIsIG9iamVjdCkge1xuXHRcdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBjYWxsZXIuYXBwbHkob2JqZWN0LCBbb2JqZWN0XSk7XG5cdFx0fTtcblx0fTtcblxuXHR0aGlzLnN0YXRlQ2hhbmdlID0gZnVuY3Rpb24gKG9iamVjdCkge1xuXHRcdGlmICh0aGlzLnJlcXVlc3QucmVhZHlTdGF0ZT09NClcblx0XHRcdHRoaXMuY2FsbGJhY2tGdW5jdGlvbih0aGlzLnJlcXVlc3QucmVzcG9uc2VUZXh0KTtcblx0fTtcblxuXHR0aGlzLmdldFJlcXVlc3QgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAod2luZG93LkFjdGl2ZVhPYmplY3QpXG5cdFx0XHRyZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01pY3Jvc29mdC5YTUxIVFRQJyk7XG5cdFx0ZWxzZSBpZiAod2luZG93LlhNTEh0dHBSZXF1ZXN0KVxuXHRcdFx0cmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblxuXHR0aGlzLnBvc3RCb2R5ID0gKGFyZ3VtZW50c1syXSB8fCBcIlwiKTtcblxuXHR0aGlzLmNhbGxiYWNrRnVuY3Rpb249Y2FsbGJhY2tGdW5jdGlvbjtcblx0dGhpcy51cmw9dXJsO1xuXHR0aGlzLnJlcXVlc3QgPSB0aGlzLmdldFJlcXVlc3QoKTtcblxuXHRpZih0aGlzLnJlcXVlc3QpIHtcblx0XHR2YXIgcmVxID0gdGhpcy5yZXF1ZXN0O1xuXHRcdHJlcS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSB0aGlzLmJpbmRGdW5jdGlvbih0aGlzLnN0YXRlQ2hhbmdlLCB0aGlzKTtcblxuXHRcdGlmICh0aGlzLnBvc3RCb2R5IT09XCJcIikge1xuXHRcdFx0cmVxLm9wZW4oXCJQT1NUXCIsIHVybCwgdHJ1ZSk7XG5cdFx0XHRyZXEuc2V0UmVxdWVzdEhlYWRlcignWC1SZXF1ZXN0ZWQtV2l0aCcsICdYTUxIdHRwUmVxdWVzdCcpO1xuXHRcdFx0cmVxLnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtdHlwZScsICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKTtcblx0XHRcdHJlcS5zZXRSZXF1ZXN0SGVhZGVyKCdDb25uZWN0aW9uJywgJ2Nsb3NlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcS5vcGVuKFwiR0VUXCIsIHVybCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cmVxLnNlbmQodGhpcy5wb3N0Qm9keSk7XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtaWNyb0FqYXg7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbWljcm9hamF4LmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBwdWJzdWIuanNcbiAqXG4gKiBBIHRpbnksIG9wdGltaXplZCwgdGVzdGVkLCBzdGFuZGFsb25lIGFuZCByb2J1c3RcbiAqIHB1YnN1YiBpbXBsZW1lbnRhdGlvbiBzdXBwb3J0aW5nIGRpZmZlcmVudCBqYXZhc2NyaXB0IGVudmlyb25tZW50c1xuICpcbiAqIEBhdXRob3IgRmVkZXJpY28gXCJMb3hcIiBMdWNpZ25hbm8gPGh0dHA6Ly9wbHVzLmx5L2ZlZGVyaWNvLmxveD5cbiAqXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9mZWRlcmljby1sb3gvcHVic3ViLmpzXG4gKi9cblxuLypnbG9iYWwgZGVmaW5lLCBtb2R1bGUqL1xuKGZ1bmN0aW9uIChjb250ZXh0KSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHQvKipcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGluaXQoKSB7XG5cdFx0Ly90aGUgY2hhbm5lbCBzdWJzY3JpcHRpb24gaGFzaFxuXHRcdHZhciBjaGFubmVscyA9IHt9LFxuXHRcdFx0Ly9oZWxwIG1pbmlmaWNhdGlvblxuXHRcdFx0ZnVuY1R5cGUgPSBGdW5jdGlvbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQvKlxuXHRcdFx0ICogQHB1YmxpY1xuXHRcdFx0ICpcblx0XHRcdCAqIFB1Ymxpc2ggc29tZSBkYXRhIG9uIGEgY2hhbm5lbFxuXHRcdFx0ICpcblx0XHRcdCAqIEBwYXJhbSBTdHJpbmcgY2hhbm5lbCBUaGUgY2hhbm5lbCB0byBwdWJsaXNoIG9uXG5cdFx0XHQgKiBAcGFyYW0gTWl4ZWQgYXJndW1lbnQgVGhlIGRhdGEgdG8gcHVibGlzaCwgdGhlIGZ1bmN0aW9uIHN1cHBvcnRzXG5cdFx0XHQgKiBhcyBtYW55IGRhdGEgcGFyYW1ldGVycyBhcyBuZWVkZWRcblx0XHRcdCAqXG5cdFx0XHQgKiBAZXhhbXBsZSBQdWJsaXNoIHN0dWZmIG9uICcvc29tZS9jaGFubmVsJy5cblx0XHRcdCAqIEFueXRoaW5nIHN1YnNjcmliZWQgd2lsbCBiZSBjYWxsZWQgd2l0aCBhIGZ1bmN0aW9uXG5cdFx0XHQgKiBzaWduYXR1cmUgbGlrZTogZnVuY3Rpb24oYSxiLGMpeyAuLi4gfVxuXHRcdFx0ICpcblx0XHRcdCAqIFB1YlN1Yi5wdWJsaXNoKFxuXHRcdFx0ICpcdFx0XCIvc29tZS9jaGFubmVsXCIsIFwiYVwiLCBcImJcIixcblx0XHRcdCAqXHRcdHt0b3RhbDogMTAsIG1pbjogMSwgbWF4OiAzfVxuXHRcdFx0ICogKTtcblx0XHRcdCAqL1xuXHRcdFx0cHVibGlzaDogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQvL2hlbHAgbWluaWZpY2F0aW9uXG5cdFx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzLFxuXHRcdFx0XHRcdC8vIGFyZ3NbMF0gaXMgdGhlIGNoYW5uZWxcblx0XHRcdFx0XHRzdWJzID0gY2hhbm5lbHNbYXJnc1swXV0sXG5cdFx0XHRcdFx0bGVuLFxuXHRcdFx0XHRcdHBhcmFtcyxcblx0XHRcdFx0XHR4O1xuXG5cdFx0XHRcdGlmIChzdWJzKSB7XG5cdFx0XHRcdFx0bGVuID0gc3Vicy5sZW5ndGg7XG5cdFx0XHRcdFx0cGFyYW1zID0gKGFyZ3MubGVuZ3RoID4gMSkgP1xuXHRcdFx0XHRcdFx0XHRBcnJheS5wcm90b3R5cGUuc3BsaWNlLmNhbGwoYXJncywgMSkgOiBbXTtcblxuXHRcdFx0XHRcdC8vcnVuIHRoZSBjYWxsYmFja3MgYXN5bmNocm9ub3VzbHksXG5cdFx0XHRcdFx0Ly9kbyBub3QgYmxvY2sgdGhlIG1haW4gZXhlY3V0aW9uIHByb2Nlc3Ncblx0XHRcdFx0XHRzZXRUaW1lb3V0KFxuXHRcdFx0XHRcdFx0ZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdFx0XHQvL2V4ZWN1dGVzIGNhbGxiYWNrcyBpbiB0aGUgb3JkZXJcblx0XHRcdFx0XHRcdFx0Ly9pbiB3aGljaCB0aGV5IHdlcmUgcmVnaXN0ZXJlZFxuXHRcdFx0XHRcdFx0XHRmb3IgKHggPSAwOyB4IDwgbGVuOyB4ICs9IDEpIHtcblx0XHRcdFx0XHRcdFx0XHRzdWJzW3hdLmFwcGx5KGNvbnRleHQsIHBhcmFtcyk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvL2NsZWFyIHJlZmVyZW5jZXMgdG8gYWxsb3cgZ2FyYmFnZSBjb2xsZWN0aW9uXG5cdFx0XHRcdFx0XHRcdHN1YnMgPSBjb250ZXh0ID0gcGFyYW1zID0gbnVsbDtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQwXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0Lypcblx0XHRcdCAqIEBwdWJsaWNcblx0XHRcdCAqXG5cdFx0XHQgKiBSZWdpc3RlciBhIGNhbGxiYWNrIG9uIGEgY2hhbm5lbFxuXHRcdFx0ICpcblx0XHRcdCAqIEBwYXJhbSBTdHJpbmcgY2hhbm5lbCBUaGUgY2hhbm5lbCB0byBzdWJzY3JpYmUgdG9cblx0XHRcdCAqIEBwYXJhbSBGdW5jdGlvbiBjYWxsYmFjayBUaGUgZXZlbnQgaGFuZGxlciwgYW55IHRpbWUgc29tZXRoaW5nIGlzXG5cdFx0XHQgKiBwdWJsaXNoZWQgb24gYSBzdWJzY3JpYmVkIGNoYW5uZWwsIHRoZSBjYWxsYmFjayB3aWxsIGJlIGNhbGxlZFxuXHRcdFx0ICogd2l0aCB0aGUgcHVibGlzaGVkIGFycmF5IGFzIG9yZGVyZWQgYXJndW1lbnRzXG5cdFx0XHQgKlxuXHRcdFx0ICogQHJldHVybiBBcnJheSBBIGhhbmRsZSB3aGljaCBjYW4gYmUgdXNlZCB0byB1bnN1YnNjcmliZSB0aGlzXG5cdFx0XHQgKiBwYXJ0aWN1bGFyIHN1YnNjcmlwdGlvblxuXHRcdFx0ICpcblx0XHRcdCAqIEBleGFtcGxlIFB1YlN1Yi5zdWJzY3JpYmUoXG5cdFx0XHQgKlx0XHRcdFx0XCIvc29tZS9jaGFubmVsXCIsXG5cdFx0XHQgKlx0XHRcdFx0ZnVuY3Rpb24oYSwgYiwgYyl7IC4uLiB9XG5cdFx0XHQgKlx0XHRcdCk7XG5cdFx0XHQgKi9cblx0XHRcdHN1YnNjcmliZTogZnVuY3Rpb24gKGNoYW5uZWwsIGNhbGxiYWNrKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY2hhbm5lbCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aHJvdyBcImludmFsaWQgb3IgbWlzc2luZyBjaGFubmVsXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIShjYWxsYmFjayBpbnN0YW5jZW9mIGZ1bmNUeXBlKSkge1xuXHRcdFx0XHRcdHRocm93IFwiaW52YWxpZCBvciBtaXNzaW5nIGNhbGxiYWNrXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWNoYW5uZWxzW2NoYW5uZWxdKSB7XG5cdFx0XHRcdFx0Y2hhbm5lbHNbY2hhbm5lbF0gPSBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNoYW5uZWxzW2NoYW5uZWxdLnB1c2goY2FsbGJhY2spO1xuXG5cdFx0XHRcdHJldHVybiB7Y2hhbm5lbDogY2hhbm5lbCwgY2FsbGJhY2s6IGNhbGxiYWNrfTtcblx0XHRcdH0sXG5cblx0XHRcdC8qXG5cdFx0XHQgKiBAcHVibGljXG5cdFx0XHQgKlxuXHRcdFx0ICogRGlzY29ubmVjdCBhIHN1YnNjcmliZWQgZnVuY3Rpb24gZi5cblx0XHRcdCAqXG5cdFx0XHQgKiBAcGFyYW0gTWl4ZWQgaGFuZGxlIFRoZSByZXR1cm4gdmFsdWUgZnJvbSBhIHN1YnNjcmliZSBjYWxsIG9yIHRoZVxuXHRcdFx0ICogbmFtZSBvZiBhIGNoYW5uZWwgYXMgYSBTdHJpbmdcblx0XHRcdCAqIEBwYXJhbSBGdW5jdGlvbiBjYWxsYmFjayBbT1BUSU9OQUxdIFRoZSBldmVudCBoYW5kbGVyIG9yaWdpbmFhbGx5XG5cdFx0XHQgKiByZWdpc3RlcmVkLCBub3QgbmVlZGVkIGlmIGhhbmRsZSBjb250YWlucyB0aGUgcmV0dXJuIHZhbHVlXG5cdFx0XHQgKiBvZiBzdWJzY3JpYmVcblx0XHRcdCAqXG5cdFx0XHQgKiBAZXhhbXBsZVxuXHRcdFx0ICogdmFyIGhhbmRsZSA9IFB1YlN1Yi5zdWJzY3JpYmUoXCIvc29tZS9jaGFubmVsXCIsIGZ1bmN0aW9uKCl7fSk7XG5cdFx0XHQgKiBQdWJTdWIudW5zdWJzY3JpYmUoaGFuZGxlKTtcblx0XHRcdCAqXG5cdFx0XHQgKiBvclxuXHRcdFx0ICpcblx0XHRcdCAqIFB1YlN1Yi51bnN1YnNjcmliZShcIi9zb21lL2NoYW5uZWxcIiwgY2FsbGJhY2spO1xuXHRcdFx0ICovXG5cdFx0XHR1bnN1YnNjcmliZTogZnVuY3Rpb24gKGhhbmRsZSwgY2FsbGJhY2spIHtcblx0XHRcdFx0aWYgKGhhbmRsZS5jaGFubmVsICYmIGhhbmRsZS5jYWxsYmFjaykge1xuXHRcdFx0XHRcdGNhbGxiYWNrID0gaGFuZGxlLmNhbGxiYWNrO1xuXHRcdFx0XHRcdGhhbmRsZSA9IGhhbmRsZS5jaGFubmVsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBoYW5kbGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIG9yIG1pc3NpbmcgY2hhbm5lbFwiO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCEoY2FsbGJhY2sgaW5zdGFuY2VvZiBmdW5jVHlwZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBcImludmFsaWQgb3IgbWlzc2luZyBjYWxsYmFja1wiO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmFyIHN1YnMgPSBjaGFubmVsc1toYW5kbGVdLFxuXHRcdFx0XHRcdHgsXG5cdFx0XHRcdFx0eSA9IChzdWJzIGluc3RhbmNlb2YgQXJyYXkpID8gc3Vicy5sZW5ndGggOiAwO1xuXG5cdFx0XHRcdGZvciAoeCA9IDA7IHggPCB5OyB4ICs9IDEpIHtcblx0XHRcdFx0XHRpZiAoc3Vic1t4XSA9PT0gY2FsbGJhY2spIHtcblx0XHRcdFx0XHRcdHN1YnMuc3BsaWNlKHgsIDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vVU1EXG5cdGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcblx0XHQvL0FNRCBtb2R1bGVcblx0XHRkZWZpbmUoJ3B1YnN1YicsIGluaXQpO1xuXHR9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG5cdFx0Ly9Db21tb25KUyBtb2R1bGVcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGluaXQoKTtcblx0fSBlbHNlIHtcblx0XHQvL3RyYWRpdGlvbmFsIG5hbWVzcGFjZVxuXHRcdGNvbnRleHQuUHViU3ViID0gaW5pdCgpO1xuXHR9XG59KHRoaXMpKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9wdWJzdWIuanNcIixcIi9cIikiXX0=
