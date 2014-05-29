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
      };
      site.defered(app, dom);
      site.events(app, dom);
    },
    events : function (app, dom) {

      app.help.addEventListenerByClass('overlay-trigger', 'click', function(){
        app.publish('/event/register/submit', true);
        app.ajax(window.location.origin + '/fragments/register', function (res) {
          app.publish('/view/register/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.help.addEventListenerByClass('signin-btn', 'click', function(e){
        e.preventDefault();
        app.help.addBodyClass('overlay-visible');
        app.ajax(window.location.origin + '/fragments/signin', function (res) {
          app.publish('/view/signin/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      if(dom.overlayClose){
        dom.overlayClose.addEventListener('click', function(){
          app.help.removeBodyClass('overlay-visible');
          app.publish('/view/overlay/closed', true);
        });
      }

      app.subscribe("/view/register/loaded", function(flag){
          if(flag === true){
            site.postSignup(app);
            app.help.addEventListenerByClass('help', 'click', function(e){
              app.help.showTooltip(e, 'help-message');
            });
          }
      });

      app.subscribe("/view/order", function(flag){
        document.getElementsByClassName('wrap')[0].innerHTML = "";
        app.ajax(window.location.origin + '/fragments/order', function (res) {
          app.publish('/view/order/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.subscribe("/view/order/loaded", function(flag){
        setTimeout(function () {
          app.help.removeBodyClass('home');
          app.help.addBodyClass('order');
        }, 1000);
        app.help.addEventListenerByClass('package-type', 'click', function(e){
          var target = e.currentTarget;
          var siblings = target.parentNode.getElementsByClassName('package-type');
          var formbtn = target.parentNode.parentNode.parentNode.getElementsByClassName('package-type-btn')[0];
          for (var i = 0; i < siblings.length; i++) {
            app.help.removeClass(siblings[i],'active');
          }
          target.className += ' active';
          app.help.removeClass(formbtn, 'disabled');
        });

        app.help.addEventListenerByClass('disabled', 'click', function(e){
          if( e.currentTarget.className.indexOf("disabled") > -1){
            e.preventDefault();
          } else {
            return true;
          }
        });
      });

      app.subscribe("/form/register/update", function(flag){
          var button = document.getElementById('create-account-button');
          if(flag == 'success'){
            app.help.addBodyClass('loading-success');
            app.help.loading(button, 'success');
            setTimeout(function () {
              app.publish('/view/order', true);
            }, 2000);
          } else {
            app.help.loading(button, 'remove');
          }
      });

      app.subscribe("/event/register/submit", function(){
        app.help.addBodyClass('overlay-visible');
      });

      app.subscribe("/message/error", function(data){
        document.getElementById("error-wrap").innerHTML += data.html;
      })
    },
    defered : function(app, dom){
      if(document.getElementsByTagName('body')[0].className.indexOf('order') > -1){
        app.ajax(window.location.origin + '/fragments/order', function (res) {
          app.publish('/view/order/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      }
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
            var tpl = app.precompile('{% for error in errors |reverse %}<div class="error">{{ error }}</div>{% endfor %}').tpl
            var template = app.render(tpl, { 'errors' : res.errors });
            app.publish('/form/register/update', 'fail');
            app.publish('/message/error', { html : template })
          } else {
            history.pushState('order', 'order', '/order');
            app.help.setCookie('key', res.key, '1');
            app.publish('/form/register/update', 'success');
          }
        });
      });
    }
  }

  site.init();
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_4f27bfd7.js","/")
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
    if(document.getElementsByTagName('body')[0].className.indexOf(c) == -1){
      return document.getElementsByTagName('body')[0].className +=' '+c;
    }
  },
  removeBodyClass : function (c) {
    helpers.removeClass(document.getElementsByTagName('body')[0], c);
  },
  removeClass : function (el, className) {
    if (el.classList){
      el.classList.remove(className);
    } else {
      el.className = el.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
    }
  },
  removeElementsByClass : function (className) {
    elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
  },
  removeEventListeners : function (elem,eventType,handler) {
    if (elem.removeEventListener) {
      elem.removeEventListener (eventType,handler,false);
    }
    if (elem.detachEvent) {
      elem.detachEvent ('on'+eventType,handler);
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
    if(type === 'success'){
      window.setTimeout(function() {
        spinner.classList.remove('active');
        spinner.className += ' active success';
      }, 1000);
    }
  },
  setCookie : function(cname,cvalue,exdays) {
    var d = new Date();
    d.setTime(d.getTime()+(exdays*24*60*60*1000));
    var expires = "expires="+d.toGMTString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2luZGV4LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvZGF0ZWZvcm1hdHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2ZpbHRlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sZXhlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvZmlsZXN5c3RlbS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvaW5kZXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzL21lbW9yeS5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3BhcnNlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3N3aWcuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2F1dG9lc2NhcGUuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Jsb2NrLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9lbHNlaWYuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2V4dGVuZHMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2ZpbHRlci5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvZm9yLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pZi5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvaW1wb3J0LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmNsdWRlLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbmRleC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvbWFjcm8uanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3BhcmVudC5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvcmF3LmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9zZXQuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3NwYWNlbGVzcy5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvbm9kZV9tb2R1bGVzL3N3aWcvbGliL3V0aWxzLmpzIiwiL1VzZXJzL2dvdXJsZXlwL1NpdGVzL21waG9sZGluZy9zcmMvanMvZmFrZV80ZjI3YmZkNy5qcyIsIi9Vc2Vycy9nb3VybGV5cC9TaXRlcy9tcGhvbGRpbmcvc3JjL2pzL2hlbHBlcnMuanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9taWNyb2FqYXguanMiLCIvVXNlcnMvZ291cmxleXAvU2l0ZXMvbXBob2xkaW5nL3NyYy9qcy9wdWJzdWIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDam5CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzF1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaHRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIixudWxsLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssXG4gIC8vIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy4gSWYgdGhlIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBhZGRpbmdcbiAgLy8gcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydFxuICAvLyBiZWNhdXNlIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy4gVGhpcyBpcyBhbiBpc3N1ZVxuICAvLyBpbiBGaXJlZm94IDQtMjkuIE5vdyBmaXhlZDogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIGFzc3VtZSB0aGF0IG9iamVjdCBpcyBhcnJheS1saWtlXG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG5cbiAgaWYgKGxlbiA8IDEwMCB8fCAhQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpKzFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlclwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgWkVSTyAgID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRtb2R1bGUuZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdG1vZHVsZS5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KCkpXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NFwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeVwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL3N3aWcnKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG52YXIgX21vbnRocyA9IHtcbiAgICBmdWxsOiBbJ0phbnVhcnknLCAnRmVicnVhcnknLCAnTWFyY2gnLCAnQXByaWwnLCAnTWF5JywgJ0p1bmUnLCAnSnVseScsICdBdWd1c3QnLCAnU2VwdGVtYmVyJywgJ09jdG9iZXInLCAnTm92ZW1iZXInLCAnRGVjZW1iZXInXSxcbiAgICBhYmJyOiBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJywgJ09jdCcsICdOb3YnLCAnRGVjJ11cbiAgfSxcbiAgX2RheXMgPSB7XG4gICAgZnVsbDogWydTdW5kYXknLCAnTW9uZGF5JywgJ1R1ZXNkYXknLCAnV2VkbmVzZGF5JywgJ1RodXJzZGF5JywgJ0ZyaWRheScsICdTYXR1cmRheSddLFxuICAgIGFiYnI6IFsnU3VuJywgJ01vbicsICdUdWUnLCAnV2VkJywgJ1RodScsICdGcmknLCAnU2F0J10sXG4gICAgYWx0OiB7Jy0xJzogJ1llc3RlcmRheScsIDA6ICdUb2RheScsIDE6ICdUb21vcnJvdyd9XG4gIH07XG5cbi8qXG5EYXRlWiBpcyBsaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2U6XG5Db3B5cmlnaHQgKGMpIDIwMTEgVG9tbyBVbml2ZXJzYWxpcyAoaHR0cDovL3RvbW91bml2ZXJzYWxpcy5jb20pXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cbiovXG5leHBvcnRzLnR6T2Zmc2V0ID0gMDtcbmV4cG9ydHMuRGF0ZVogPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtZW1iZXJzID0ge1xuICAgICAgJ2RlZmF1bHQnOiBbJ2dldFVUQ0RhdGUnLCAnZ2V0VVRDRGF5JywgJ2dldFVUQ0Z1bGxZZWFyJywgJ2dldFVUQ0hvdXJzJywgJ2dldFVUQ01pbGxpc2Vjb25kcycsICdnZXRVVENNaW51dGVzJywgJ2dldFVUQ01vbnRoJywgJ2dldFVUQ1NlY29uZHMnLCAndG9JU09TdHJpbmcnLCAndG9HTVRTdHJpbmcnLCAndG9VVENTdHJpbmcnLCAndmFsdWVPZicsICdnZXRUaW1lJ10sXG4gICAgICB6OiBbJ2dldERhdGUnLCAnZ2V0RGF5JywgJ2dldEZ1bGxZZWFyJywgJ2dldEhvdXJzJywgJ2dldE1pbGxpc2Vjb25kcycsICdnZXRNaW51dGVzJywgJ2dldE1vbnRoJywgJ2dldFNlY29uZHMnLCAnZ2V0WWVhcicsICd0b0RhdGVTdHJpbmcnLCAndG9Mb2NhbGVEYXRlU3RyaW5nJywgJ3RvTG9jYWxlVGltZVN0cmluZyddXG4gICAgfSxcbiAgICBkID0gdGhpcztcblxuICBkLmRhdGUgPSBkLmRhdGVaID0gKGFyZ3VtZW50cy5sZW5ndGggPiAxKSA/IG5ldyBEYXRlKERhdGUuVVRDLmFwcGx5KERhdGUsIGFyZ3VtZW50cykgKyAoKG5ldyBEYXRlKCkpLmdldFRpbWV6b25lT2Zmc2V0KCkgKiA2MDAwMCkpIDogKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpID8gbmV3IERhdGUobmV3IERhdGUoYXJndW1lbnRzWycwJ10pKSA6IG5ldyBEYXRlKCk7XG5cbiAgZC50aW1lem9uZU9mZnNldCA9IGQuZGF0ZVouZ2V0VGltZXpvbmVPZmZzZXQoKTtcblxuICB1dGlscy5lYWNoKG1lbWJlcnMueiwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICBkW25hbWVdID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGQuZGF0ZVpbbmFtZV0oKTtcbiAgICB9O1xuICB9KTtcbiAgdXRpbHMuZWFjaChtZW1iZXJzWydkZWZhdWx0J10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgZFtuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBkLmRhdGVbbmFtZV0oKTtcbiAgICB9O1xuICB9KTtcblxuICB0aGlzLnNldFRpbWV6b25lT2Zmc2V0KGV4cG9ydHMudHpPZmZzZXQpO1xufTtcbmV4cG9ydHMuRGF0ZVoucHJvdG90eXBlID0ge1xuICBnZXRUaW1lem9uZU9mZnNldDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnRpbWV6b25lT2Zmc2V0O1xuICB9LFxuICBzZXRUaW1lem9uZU9mZnNldDogZnVuY3Rpb24gKG9mZnNldCkge1xuICAgIHRoaXMudGltZXpvbmVPZmZzZXQgPSBvZmZzZXQ7XG4gICAgdGhpcy5kYXRlWiA9IG5ldyBEYXRlKHRoaXMuZGF0ZS5nZXRUaW1lKCkgKyB0aGlzLmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwIC0gdGhpcy50aW1lem9uZU9mZnNldCAqIDYwMDAwKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxufTtcblxuLy8gRGF5XG5leHBvcnRzLmQgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIChpbnB1dC5nZXREYXRlKCkgPCAxMCA/ICcwJyA6ICcnKSArIGlucHV0LmdldERhdGUoKTtcbn07XG5leHBvcnRzLkQgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIF9kYXlzLmFiYnJbaW5wdXQuZ2V0RGF5KCldO1xufTtcbmV4cG9ydHMuaiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0RGF0ZSgpO1xufTtcbmV4cG9ydHMubCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gX2RheXMuZnVsbFtpbnB1dC5nZXREYXkoKV07XG59O1xuZXhwb3J0cy5OID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBkID0gaW5wdXQuZ2V0RGF5KCk7XG4gIHJldHVybiAoZCA+PSAxKSA/IGQgOiA3O1xufTtcbmV4cG9ydHMuUyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgZCA9IGlucHV0LmdldERhdGUoKTtcbiAgcmV0dXJuIChkICUgMTAgPT09IDEgJiYgZCAhPT0gMTEgPyAnc3QnIDogKGQgJSAxMCA9PT0gMiAmJiBkICE9PSAxMiA/ICduZCcgOiAoZCAlIDEwID09PSAzICYmIGQgIT09IDEzID8gJ3JkJyA6ICd0aCcpKSk7XG59O1xuZXhwb3J0cy53ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXREYXkoKTtcbn07XG5leHBvcnRzLnogPSBmdW5jdGlvbiAoaW5wdXQsIG9mZnNldCwgYWJicikge1xuICB2YXIgeWVhciA9IGlucHV0LmdldEZ1bGxZZWFyKCksXG4gICAgZSA9IG5ldyBleHBvcnRzLkRhdGVaKHllYXIsIGlucHV0LmdldE1vbnRoKCksIGlucHV0LmdldERhdGUoKSwgMTIsIDAsIDApLFxuICAgIGQgPSBuZXcgZXhwb3J0cy5EYXRlWih5ZWFyLCAwLCAxLCAxMiwgMCwgMCk7XG5cbiAgZS5zZXRUaW1lem9uZU9mZnNldChvZmZzZXQsIGFiYnIpO1xuICBkLnNldFRpbWV6b25lT2Zmc2V0KG9mZnNldCwgYWJicik7XG4gIHJldHVybiBNYXRoLnJvdW5kKChlIC0gZCkgLyA4NjQwMDAwMCk7XG59O1xuXG4vLyBXZWVrXG5leHBvcnRzLlcgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIHRhcmdldCA9IG5ldyBEYXRlKGlucHV0LnZhbHVlT2YoKSksXG4gICAgZGF5TnIgPSAoaW5wdXQuZ2V0RGF5KCkgKyA2KSAlIDcsXG4gICAgZlRodXJzO1xuXG4gIHRhcmdldC5zZXREYXRlKHRhcmdldC5nZXREYXRlKCkgLSBkYXlOciArIDMpO1xuICBmVGh1cnMgPSB0YXJnZXQudmFsdWVPZigpO1xuICB0YXJnZXQuc2V0TW9udGgoMCwgMSk7XG4gIGlmICh0YXJnZXQuZ2V0RGF5KCkgIT09IDQpIHtcbiAgICB0YXJnZXQuc2V0TW9udGgoMCwgMSArICgoNCAtIHRhcmdldC5nZXREYXkoKSkgKyA3KSAlIDcpO1xuICB9XG5cbiAgcmV0dXJuIDEgKyBNYXRoLmNlaWwoKGZUaHVycyAtIHRhcmdldCkgLyA2MDQ4MDAwMDApO1xufTtcblxuLy8gTW9udGhcbmV4cG9ydHMuRiA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gX21vbnRocy5mdWxsW2lucHV0LmdldE1vbnRoKCldO1xufTtcbmV4cG9ydHMubSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gKGlucHV0LmdldE1vbnRoKCkgPCA5ID8gJzAnIDogJycpICsgKGlucHV0LmdldE1vbnRoKCkgKyAxKTtcbn07XG5leHBvcnRzLk0gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIF9tb250aHMuYWJicltpbnB1dC5nZXRNb250aCgpXTtcbn07XG5leHBvcnRzLm4gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldE1vbnRoKCkgKyAxO1xufTtcbmV4cG9ydHMudCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gMzIgLSAobmV3IERhdGUoaW5wdXQuZ2V0RnVsbFllYXIoKSwgaW5wdXQuZ2V0TW9udGgoKSwgMzIpLmdldERhdGUoKSk7XG59O1xuXG4vLyBZZWFyXG5leHBvcnRzLkwgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIG5ldyBEYXRlKGlucHV0LmdldEZ1bGxZZWFyKCksIDEsIDI5KS5nZXREYXRlKCkgPT09IDI5O1xufTtcbmV4cG9ydHMubyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgdGFyZ2V0ID0gbmV3IERhdGUoaW5wdXQudmFsdWVPZigpKTtcbiAgdGFyZ2V0LnNldERhdGUodGFyZ2V0LmdldERhdGUoKSAtICgoaW5wdXQuZ2V0RGF5KCkgKyA2KSAlIDcpICsgMyk7XG4gIHJldHVybiB0YXJnZXQuZ2V0RnVsbFllYXIoKTtcbn07XG5leHBvcnRzLlkgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldEZ1bGxZZWFyKCk7XG59O1xuZXhwb3J0cy55ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiAoaW5wdXQuZ2V0RnVsbFllYXIoKS50b1N0cmluZygpKS5zdWJzdHIoMik7XG59O1xuXG4vLyBUaW1lXG5leHBvcnRzLmEgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldEhvdXJzKCkgPCAxMiA/ICdhbScgOiAncG0nO1xufTtcbmV4cG9ydHMuQSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0SG91cnMoKSA8IDEyID8gJ0FNJyA6ICdQTSc7XG59O1xuZXhwb3J0cy5CID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBob3VycyA9IGlucHV0LmdldFVUQ0hvdXJzKCksIGJlYXRzO1xuICBob3VycyA9IChob3VycyA9PT0gMjMpID8gMCA6IGhvdXJzICsgMTtcbiAgYmVhdHMgPSBNYXRoLmFicygoKCgoaG91cnMgKiA2MCkgKyBpbnB1dC5nZXRVVENNaW51dGVzKCkpICogNjApICsgaW5wdXQuZ2V0VVRDU2Vjb25kcygpKSAvIDg2LjQpLnRvRml4ZWQoMCk7XG4gIHJldHVybiAoJzAwMCcuY29uY2F0KGJlYXRzKS5zbGljZShiZWF0cy5sZW5ndGgpKTtcbn07XG5leHBvcnRzLmcgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGggPSBpbnB1dC5nZXRIb3VycygpO1xuICByZXR1cm4gaCA9PT0gMCA/IDEyIDogKGggPiAxMiA/IGggLSAxMiA6IGgpO1xufTtcbmV4cG9ydHMuRyA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQuZ2V0SG91cnMoKTtcbn07XG5leHBvcnRzLmggPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIGggPSBpbnB1dC5nZXRIb3VycygpO1xuICByZXR1cm4gKChoIDwgMTAgfHwgKDEyIDwgaCAmJiAyMiA+IGgpKSA/ICcwJyA6ICcnKSArICgoaCA8IDEyKSA/IGggOiBoIC0gMTIpO1xufTtcbmV4cG9ydHMuSCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgaCA9IGlucHV0LmdldEhvdXJzKCk7XG4gIHJldHVybiAoaCA8IDEwID8gJzAnIDogJycpICsgaDtcbn07XG5leHBvcnRzLmkgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG0gPSBpbnB1dC5nZXRNaW51dGVzKCk7XG4gIHJldHVybiAobSA8IDEwID8gJzAnIDogJycpICsgbTtcbn07XG5leHBvcnRzLnMgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIHMgPSBpbnB1dC5nZXRTZWNvbmRzKCk7XG4gIHJldHVybiAocyA8IDEwID8gJzAnIDogJycpICsgcztcbn07XG4vL3UgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnJzsgfSxcblxuLy8gVGltZXpvbmVcbi8vZSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcnOyB9LFxuLy9JID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJyc7IH0sXG5leHBvcnRzLk8gPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIHR6ID0gaW5wdXQuZ2V0VGltZXpvbmVPZmZzZXQoKTtcbiAgcmV0dXJuICh0eiA8IDAgPyAnLScgOiAnKycpICsgKHR6IC8gNjAgPCAxMCA/ICcwJyA6ICcnKSArIE1hdGguYWJzKCh0eiAvIDYwKSkgKyAnMDAnO1xufTtcbi8vVCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcnOyB9LFxuZXhwb3J0cy5aID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5nZXRUaW1lem9uZU9mZnNldCgpICogNjA7XG59O1xuXG4vLyBGdWxsIERhdGUvVGltZVxuZXhwb3J0cy5jID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC50b0lTT1N0cmluZygpO1xufTtcbmV4cG9ydHMuciA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gaW5wdXQudG9VVENTdHJpbmcoKTtcbn07XG5leHBvcnRzLlUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmdldFRpbWUoKSAvIDEwMDA7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9kYXRlZm9ybWF0dGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpLFxuICBkYXRlRm9ybWF0dGVyID0gcmVxdWlyZSgnLi9kYXRlZm9ybWF0dGVyJyk7XG5cbi8qKlxuICogSGVscGVyIG1ldGhvZCB0byByZWN1cnNpdmVseSBydW4gYSBmaWx0ZXIgYWNyb3NzIGFuIG9iamVjdC9hcnJheSBhbmQgYXBwbHkgaXQgdG8gYWxsIG9mIHRoZSBvYmplY3QvYXJyYXkncyB2YWx1ZXMuXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHJldHVybiB7Kn1cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGl0ZXJhdGVGaWx0ZXIoaW5wdXQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzLFxuICAgIG91dCA9IHt9O1xuXG4gIGlmICh1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHJldHVybiB1dGlscy5tYXAoaW5wdXQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgcmV0dXJuIHNlbGYuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnKSB7XG4gICAgdXRpbHMuZWFjaChpbnB1dCwgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgIG91dFtrZXldID0gc2VsZi5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH0pO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm47XG59XG5cbi8qKlxuICogQmFja3NsYXNoLWVzY2FwZSBjaGFyYWN0ZXJzIHRoYXQgbmVlZCB0byBiZSBlc2NhcGVkLlxuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcIlxcXCJxdW90ZWQgc3RyaW5nXFxcIlwifGFkZHNsYXNoZXMgfX1cbiAqIC8vID0+IFxcXCJxdW90ZWQgc3RyaW5nXFxcIlxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgIEJhY2tzbGFzaC1lc2NhcGVkIHN0cmluZy5cbiAqL1xuZXhwb3J0cy5hZGRzbGFzaGVzID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMuYWRkc2xhc2hlcywgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1xcJy9nLCBcIlxcXFwnXCIpLnJlcGxhY2UoL1xcXCIvZywgJ1xcXFxcIicpO1xufTtcblxuLyoqXG4gKiBVcHBlci1jYXNlIHRoZSBmaXJzdCBsZXR0ZXIgb2YgdGhlIGlucHV0IGFuZCBsb3dlci1jYXNlIHRoZSByZXN0LlxuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcImkgbGlrZSBCdXJyaXRvc1wifGNhcGl0YWxpemUgfX1cbiAqIC8vID0+IEkgbGlrZSBidXJyaXRvc1xuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0ICBJZiBnaXZlbiBhbiBhcnJheSBvciBvYmplY3QsIGVhY2ggc3RyaW5nIG1lbWJlciB3aWxsIGJlIHJ1biB0aHJvdWdoIHRoZSBmaWx0ZXIgaW5kaXZpZHVhbGx5LlxuICogQHJldHVybiB7Kn0gICAgICAgIFJldHVybnMgdGhlIHNhbWUgdHlwZSBhcyB0aGUgaW5wdXQuXG4gKi9cbmV4cG9ydHMuY2FwaXRhbGl6ZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLmNhcGl0YWxpemUsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQudG9TdHJpbmcoKS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGlucHV0LnRvU3RyaW5nKCkuc3Vic3RyKDEpLnRvTG93ZXJDYXNlKCk7XG59O1xuXG4vKipcbiAqIEZvcm1hdCBhIGRhdGUgb3IgRGF0ZS1jb21wYXRpYmxlIHN0cmluZy5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbm93ID0gbmV3IERhdGUoKTtcbiAqIHt7IG5vd3xkYXRlKCdZLW0tZCcpIH19XG4gKiAvLyA9PiAyMDEzLTA4LTE0XG4gKlxuICogQHBhcmFtICB7PyhzdHJpbmd8ZGF0ZSl9IGlucHV0XG4gKiBAcGFyYW0gIHtzdHJpbmd9IGZvcm1hdCAgUEhQLXN0eWxlIGRhdGUgZm9ybWF0IGNvbXBhdGlibGUgc3RyaW5nLlxuICogQHBhcmFtICB7bnVtYmVyPX0gb2Zmc2V0IFRpbWV6b25lIG9mZnNldCBmcm9tIEdNVCBpbiBtaW51dGVzLlxuICogQHBhcmFtICB7c3RyaW5nPX0gYWJiciAgIFRpbWV6b25lIGFiYnJldmlhdGlvbi4gVXNlZCBmb3Igb3V0cHV0IG9ubHkuXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgRm9ybWF0dGVkIGRhdGUgc3RyaW5nLlxuICovXG5leHBvcnRzLmRhdGUgPSBmdW5jdGlvbiAoaW5wdXQsIGZvcm1hdCwgb2Zmc2V0LCBhYmJyKSB7XG4gIHZhciBsID0gZm9ybWF0Lmxlbmd0aCxcbiAgICBkYXRlID0gbmV3IGRhdGVGb3JtYXR0ZXIuRGF0ZVooaW5wdXQpLFxuICAgIGN1cixcbiAgICBpID0gMCxcbiAgICBvdXQgPSAnJztcblxuICBpZiAob2Zmc2V0KSB7XG4gICAgZGF0ZS5zZXRUaW1lem9uZU9mZnNldChvZmZzZXQsIGFiYnIpO1xuICB9XG5cbiAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgY3VyID0gZm9ybWF0LmNoYXJBdChpKTtcbiAgICBpZiAoZGF0ZUZvcm1hdHRlci5oYXNPd25Qcm9wZXJ0eShjdXIpKSB7XG4gICAgICBvdXQgKz0gZGF0ZUZvcm1hdHRlcltjdXJdKGRhdGUsIG9mZnNldCwgYWJicik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dCArPSBjdXI7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIElmIHRoZSBpbnB1dCBpcyBgdW5kZWZpbmVkYCwgYG51bGxgLCBvciBgZmFsc2VgLCBhIGRlZmF1bHQgcmV0dXJuIHZhbHVlIGNhbiBiZSBzcGVjaWZpZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IG51bGxfdmFsdWV8ZGVmYXVsdCgnVGFjb3MnKSB9fVxuICogLy8gPT4gVGFjb3NcbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCJCdXJyaXRvc1wifGRlZmF1bHQoXCJUYWNvc1wiKSB9fVxuICogLy8gPT4gQnVycml0b3NcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEBwYXJhbSAgeyp9ICBkZWYgICAgIFZhbHVlIHRvIHJldHVybiBpZiBgaW5wdXRgIGlzIGB1bmRlZmluZWRgLCBgbnVsbGAsIG9yIGBmYWxzZWAuXG4gKiBAcmV0dXJuIHsqfSAgICAgICAgICBgaW5wdXRgIG9yIGBkZWZgIHZhbHVlLlxuICovXG5leHBvcnRzW1wiZGVmYXVsdFwiXSA9IGZ1bmN0aW9uIChpbnB1dCwgZGVmKSB7XG4gIHJldHVybiAodHlwZW9mIGlucHV0ICE9PSAndW5kZWZpbmVkJyAmJiAoaW5wdXQgfHwgdHlwZW9mIGlucHV0ID09PSAnbnVtYmVyJykpID8gaW5wdXQgOiBkZWY7XG59O1xuXG4vKipcbiAqIEZvcmNlIGVzY2FwZSB0aGUgb3V0cHV0IG9mIHRoZSB2YXJpYWJsZS4gT3B0aW9uYWxseSB1c2UgYGVgIGFzIGEgc2hvcnRjdXQgZmlsdGVyIG5hbWUuIFRoaXMgZmlsdGVyIHdpbGwgYmUgYXBwbGllZCBieSBkZWZhdWx0IGlmIGF1dG9lc2NhcGUgaXMgdHVybmVkIG9uLlxuICpcbiAqIEBleGFtcGxlXG4gKiB7eyBcIjxibGFoPlwifGVzY2FwZSB9fVxuICogLy8gPT4gJmx0O2JsYWgmZ3Q7XG4gKlxuICogQGV4YW1wbGVcbiAqIHt7IFwiPGJsYWg+XCJ8ZShcImpzXCIpIH19XG4gKiAvLyA9PiBcXHUwMDNDYmxhaFxcdTAwM0VcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHBhcmFtICB7c3RyaW5nfSBbdHlwZT0naHRtbCddICAgSWYgeW91IHBhc3MgdGhlIHN0cmluZyBqcyBpbiBhcyB0aGUgdHlwZSwgb3V0cHV0IHdpbGwgYmUgZXNjYXBlZCBzbyB0aGF0IGl0IGlzIHNhZmUgZm9yIEphdmFTY3JpcHQgZXhlY3V0aW9uLlxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgIEVzY2FwZWQgc3RyaW5nLlxuICovXG5leHBvcnRzLmVzY2FwZSA9IGZ1bmN0aW9uIChpbnB1dCwgdHlwZSkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLmVzY2FwZSwgYXJndW1lbnRzKSxcbiAgICBpbnAgPSBpbnB1dCxcbiAgICBpID0gMCxcbiAgICBjb2RlO1xuXG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICBpZiAodHlwZW9mIGlucHV0ICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dDtcbiAgfVxuXG4gIG91dCA9ICcnO1xuXG4gIHN3aXRjaCAodHlwZSkge1xuICBjYXNlICdqcyc6XG4gICAgaW5wID0gaW5wLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFx1MDA1QycpO1xuICAgIGZvciAoaTsgaSA8IGlucC5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29kZSA9IGlucC5jaGFyQ29kZUF0KGkpO1xuICAgICAgaWYgKGNvZGUgPCAzMikge1xuICAgICAgICBjb2RlID0gY29kZS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICAgICAgY29kZSA9IChjb2RlLmxlbmd0aCA8IDIpID8gJzAnICsgY29kZSA6IGNvZGU7XG4gICAgICAgIG91dCArPSAnXFxcXHUwMCcgKyBjb2RlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0ICs9IGlucFtpXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dC5yZXBsYWNlKC8mL2csICdcXFxcdTAwMjYnKVxuICAgICAgLnJlcGxhY2UoLzwvZywgJ1xcXFx1MDAzQycpXG4gICAgICAucmVwbGFjZSgvPi9nLCAnXFxcXHUwMDNFJylcbiAgICAgIC5yZXBsYWNlKC9cXCcvZywgJ1xcXFx1MDAyNycpXG4gICAgICAucmVwbGFjZSgvXCIvZywgJ1xcXFx1MDAyMicpXG4gICAgICAucmVwbGFjZSgvXFw9L2csICdcXFxcdTAwM0QnKVxuICAgICAgLnJlcGxhY2UoLy0vZywgJ1xcXFx1MDAyRCcpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnXFxcXHUwMDNCJyk7XG5cbiAgZGVmYXVsdDpcbiAgICByZXR1cm4gaW5wLnJlcGxhY2UoLyYoPyFhbXA7fGx0O3xndDt8cXVvdDt8IzM5OykvZywgJyZhbXA7JylcbiAgICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xuICB9XG59O1xuZXhwb3J0cy5lID0gZXhwb3J0cy5lc2NhcGU7XG5cbi8qKlxuICogR2V0IHRoZSBmaXJzdCBpdGVtIGluIGFuIGFycmF5IG9yIGNoYXJhY3RlciBpbiBhIHN0cmluZy4gQWxsIG90aGVyIG9iamVjdHMgd2lsbCBhdHRlbXB0IHRvIHJldHVybiB0aGUgZmlyc3QgdmFsdWUgYXZhaWxhYmxlLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnIgPSBbJ2EnLCAnYicsICdjJ11cbiAqIHt7IG15X2FycnxmaXJzdCB9fVxuICogLy8gPT4gYVxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV92YWwgPSAnVGFjb3MnXG4gKiB7eyBteV92YWx8Zmlyc3QgfX1cbiAqIC8vIFRcbiAqXG4gKiBAcGFyYW0gIHsqfSBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgIFRoZSBmaXJzdCBpdGVtIG9mIHRoZSBhcnJheSBvciBmaXJzdCBjaGFyYWN0ZXIgb2YgdGhlIHN0cmluZyBpbnB1dC5cbiAqL1xuZXhwb3J0cy5maXJzdCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnb2JqZWN0JyAmJiAhdXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICB2YXIga2V5cyA9IHV0aWxzLmtleXMoaW5wdXQpO1xuICAgIHJldHVybiBpbnB1dFtrZXlzWzBdXTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0LnN1YnN0cigwLCAxKTtcbiAgfVxuXG4gIHJldHVybiBpbnB1dFswXTtcbn07XG5cbi8qKlxuICogR3JvdXAgYW4gYXJyYXkgb2Ygb2JqZWN0cyBieSBhIGNvbW1vbiBrZXkuIElmIGFuIGFycmF5IGlzIG5vdCBwcm92aWRlZCwgdGhlIGlucHV0IHZhbHVlIHdpbGwgYmUgcmV0dXJuZWQgdW50b3VjaGVkLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBwZW9wbGUgPSBbeyBhZ2U6IDIzLCBuYW1lOiAnUGF1bCcgfSwgeyBhZ2U6IDI2LCBuYW1lOiAnSmFuZScgfSwgeyBhZ2U6IDIzLCBuYW1lOiAnSmltJyB9XTtcbiAqIHslIGZvciBhZ2Vncm91cCBpbiBwZW9wbGV8Z3JvdXBCeSgnYWdlJykgJX1cbiAqICAgPGgyPnt7IGxvb3Aua2V5IH19PC9oMj5cbiAqICAgPHVsPlxuICogICAgIHslIGZvciBwZXJzb24gaW4gYWdlZ3JvdXAgJX1cbiAqICAgICA8bGk+e3sgcGVyc29uLm5hbWUgfX08L2xpPlxuICogICAgIHslIGVuZGZvciAlfVxuICogICA8L3VsPlxuICogeyUgZW5kZm9yICV9XG4gKlxuICogQHBhcmFtICB7Kn0gICAgICBpbnB1dCBJbnB1dCBvYmplY3QuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGtleSAgIEtleSB0byBncm91cCBieS5cbiAqIEByZXR1cm4ge29iamVjdH0gICAgICAgR3JvdXBlZCBhcnJheXMgYnkgZ2l2ZW4ga2V5LlxuICovXG5leHBvcnRzLmdyb3VwQnkgPSBmdW5jdGlvbiAoaW5wdXQsIGtleSkge1xuICBpZiAoIXV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgcmV0dXJuIGlucHV0O1xuICB9XG5cbiAgdmFyIG91dCA9IHt9O1xuXG4gIHV0aWxzLmVhY2goaW5wdXQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIGlmICghdmFsdWUuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBrZXluYW1lID0gdmFsdWVba2V5XSxcbiAgICAgIG5ld1ZhbCA9IHV0aWxzLmV4dGVuZCh7fSwgdmFsdWUpO1xuICAgIGRlbGV0ZSB2YWx1ZVtrZXldO1xuXG4gICAgaWYgKCFvdXRba2V5bmFtZV0pIHtcbiAgICAgIG91dFtrZXluYW1lXSA9IFtdO1xuICAgIH1cblxuICAgIG91dFtrZXluYW1lXS5wdXNoKHZhbHVlKTtcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogSm9pbiB0aGUgaW5wdXQgd2l0aCBhIHN0cmluZy5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfYXJyYXkgPSBbJ2ZvbycsICdiYXInLCAnYmF6J11cbiAqIHt7IG15X2FycmF5fGpvaW4oJywgJykgfX1cbiAqIC8vID0+IGZvbywgYmFyLCBiYXpcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfa2V5X29iamVjdCA9IHsgYTogJ2ZvbycsIGI6ICdiYXInLCBjOiAnYmF6JyB9XG4gKiB7eyBteV9rZXlfb2JqZWN0fGpvaW4oJyBhbmQgJykgfX1cbiAqIC8vID0+IGZvbyBhbmQgYmFyIGFuZCBiYXpcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEBwYXJhbSAge3N0cmluZ30gZ2x1ZSAgICBTdHJpbmcgdmFsdWUgdG8gam9pbiBpdGVtcyB0b2dldGhlci5cbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24gKGlucHV0LCBnbHVlKSB7XG4gIGlmICh1dGlscy5pc0FycmF5KGlucHV0KSkge1xuICAgIHJldHVybiBpbnB1dC5qb2luKGdsdWUpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcpIHtcbiAgICB2YXIgb3V0ID0gW107XG4gICAgdXRpbHMuZWFjaChpbnB1dCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICBvdXQucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG91dC5qb2luKGdsdWUpO1xuICB9XG4gIHJldHVybiBpbnB1dDtcbn07XG5cbi8qKlxuICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGFuIEphdmFTY3JpcHQgb2JqZWN0LlxuICpcbiAqIEJhY2t3YXJkcyBjb21wYXRpYmxlIHdpdGggc3dpZ0AwLngueCB1c2luZyBganNvbl9lbmNvZGVgLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSB7IGE6ICdiJyB9XG4gKiB7eyB2YWx8anNvbiB9fVxuICogLy8gPT4ge1wiYVwiOlwiYlwifVxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSB7IGE6ICdiJyB9XG4gKiB7eyB2YWx8anNvbig0KSB9fVxuICogLy8gPT4ge1xuICogLy8gICAgICAgIFwiYVwiOiBcImJcIlxuICogLy8gICAgfVxuICpcbiAqIEBwYXJhbSAgeyp9ICAgIGlucHV0XG4gKiBAcGFyYW0gIHtudW1iZXJ9ICBbaW5kZW50XSAgTnVtYmVyIG9mIHNwYWNlcyB0byBpbmRlbnQgZm9yIHByZXR0eS1mb3JtYXR0aW5nLlxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgQSB2YWxpZCBKU09OIHN0cmluZy5cbiAqL1xuZXhwb3J0cy5qc29uID0gZnVuY3Rpb24gKGlucHV0LCBpbmRlbnQpIHtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCBpbmRlbnQgfHwgMCk7XG59O1xuZXhwb3J0cy5qc29uX2VuY29kZSA9IGV4cG9ydHMuanNvbjtcblxuLyoqXG4gKiBHZXQgdGhlIGxhc3QgaXRlbSBpbiBhbiBhcnJheSBvciBjaGFyYWN0ZXIgaW4gYSBzdHJpbmcuIEFsbCBvdGhlciBvYmplY3RzIHdpbGwgYXR0ZW1wdCB0byByZXR1cm4gdGhlIGxhc3QgdmFsdWUgYXZhaWxhYmxlLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnIgPSBbJ2EnLCAnYicsICdjJ11cbiAqIHt7IG15X2FycnxsYXN0IH19XG4gKiAvLyA9PiBjXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhbCA9ICdUYWNvcydcbiAqIHt7IG15X3ZhbHxsYXN0IH19XG4gKiAvLyBzXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICAgIFRoZSBsYXN0IGl0ZW0gb2YgdGhlIGFycmF5IG9yIGxhc3QgY2hhcmFjdGVyIG9mIHRoZSBzdHJpbmcuaW5wdXQuXG4gKi9cbmV4cG9ydHMubGFzdCA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnb2JqZWN0JyAmJiAhdXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICB2YXIga2V5cyA9IHV0aWxzLmtleXMoaW5wdXQpO1xuICAgIHJldHVybiBpbnB1dFtrZXlzW2tleXMubGVuZ3RoIC0gMV1dO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQuY2hhckF0KGlucHV0Lmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIGlucHV0W2lucHV0Lmxlbmd0aCAtIDFdO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIGlucHV0IGluIGFsbCBsb3dlcmNhc2UgbGV0dGVycy5cbiAqXG4gKiBAZXhhbXBsZVxuICoge3sgXCJGT09CQVJcInxsb3dlciB9fVxuICogLy8gPT4gZm9vYmFyXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15T2JqID0geyBhOiAnRk9PJywgYjogJ0JBUicgfVxuICoge3sgbXlPYmp8bG93ZXJ8am9pbignJykgfX1cbiAqIC8vID0+IGZvb2JhclxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgICAgUmV0dXJucyB0aGUgc2FtZSB0eXBlIGFzIHRoZSBpbnB1dC5cbiAqL1xuZXhwb3J0cy5sb3dlciA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLmxvd2VyLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcbn07XG5cbi8qKlxuICogRGVwcmVjYXRlZCBpbiBmYXZvciBvZiA8YSBocmVmPVwiI3NhZmVcIj5zYWZlPC9hPi5cbiAqL1xuZXhwb3J0cy5yYXcgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgcmV0dXJuIGV4cG9ydHMuc2FmZShpbnB1dCk7XG59O1xuZXhwb3J0cy5yYXcuc2FmZSA9IHRydWU7XG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyBzdHJpbmcgd2l0aCB0aGUgbWF0Y2hlZCBzZWFyY2ggcGF0dGVybiByZXBsYWNlZCBieSB0aGUgZ2l2ZW4gcmVwbGFjZW1lbnQgc3RyaW5nLiBVc2VzIEphdmFTY3JpcHQncyBidWlsdC1pbiBTdHJpbmcucmVwbGFjZSgpIG1ldGhvZC5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFyID0gJ2Zvb2Jhcic7XG4gKiB7eyBteV92YXJ8cmVwbGFjZSgnbycsICdlJywgJ2cnKSB9fVxuICogLy8gPT4gZmVlYmFyXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhciA9IFwiZmFyZmVnbnVnZW5cIjtcbiAqIHt7IG15X3ZhcnxyZXBsYWNlKCdeZicsICdwJykgfX1cbiAqIC8vID0+IHBhcmZlZ251Z2VuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3ZhciA9ICdhMWIyYzMnO1xuICoge3sgbXlfdmFyfHJlcGxhY2UoJ1xcdycsICcwJywgJ2cnKSB9fVxuICogLy8gPT4gMDEwMjAzXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBpbnB1dFxuICogQHBhcmFtICB7c3RyaW5nfSBzZWFyY2ggICAgICBTdHJpbmcgb3IgcGF0dGVybiB0byByZXBsYWNlIGZyb20gdGhlIGlucHV0LlxuICogQHBhcmFtICB7c3RyaW5nfSByZXBsYWNlbWVudCBTdHJpbmcgdG8gcmVwbGFjZSBtYXRjaGVkIHBhdHRlcm4uXG4gKiBAcGFyYW0gIHtzdHJpbmd9IFtmbGFnc10gICAgICBSZWd1bGFyIEV4cHJlc3Npb24gZmxhZ3MuICdnJzogZ2xvYmFsIG1hdGNoLCAnaSc6IGlnbm9yZSBjYXNlLCAnbSc6IG1hdGNoIG92ZXIgbXVsdGlwbGUgbGluZXNcbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgUmVwbGFjZWQgc3RyaW5nLlxuICovXG5leHBvcnRzLnJlcGxhY2UgPSBmdW5jdGlvbiAoaW5wdXQsIHNlYXJjaCwgcmVwbGFjZW1lbnQsIGZsYWdzKSB7XG4gIHZhciByID0gbmV3IFJlZ0V4cChzZWFyY2gsIGZsYWdzKTtcbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UociwgcmVwbGFjZW1lbnQpO1xufTtcblxuLyoqXG4gKiBSZXZlcnNlIHNvcnQgdGhlIGlucHV0LiBUaGlzIGlzIGFuIGFsaWFzIGZvciA8Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnt7IGlucHV0fHNvcnQodHJ1ZSkgfX08L2NvZGU+LlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSBbMSwgMiwgM107XG4gKiB7eyB2YWx8cmV2ZXJzZSB9fVxuICogLy8gPT4gMywyLDFcbiAqXG4gKiBAcGFyYW0gIHthcnJheX0gIGlucHV0XG4gKiBAcmV0dXJuIHthcnJheX0gICAgICAgIFJldmVyc2VkIGFycmF5LiBUaGUgb3JpZ2luYWwgaW5wdXQgb2JqZWN0IGlzIHJldHVybmVkIGlmIGl0IHdhcyBub3QgYW4gYXJyYXkuXG4gKi9cbmV4cG9ydHMucmV2ZXJzZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICByZXR1cm4gZXhwb3J0cy5zb3J0KGlucHV0LCB0cnVlKTtcbn07XG5cbi8qKlxuICogRm9yY2VzIHRoZSBpbnB1dCB0byBub3QgYmUgYXV0by1lc2NhcGVkLiBVc2UgdGhpcyBvbmx5IG9uIGNvbnRlbnQgdGhhdCB5b3Uga25vdyBpcyBzYWZlIHRvIGJlIHJlbmRlcmVkIG9uIHlvdXIgcGFnZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfdmFyID0gXCI8cD5TdHVmZjwvcD5cIjtcbiAqIHt7IG15X3ZhcnxzYWZlIH19XG4gKiAvLyA9PiA8cD5TdHVmZjwvcD5cbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICAgIFRoZSBpbnB1dCBleGFjdGx5IGhvdyBpdCB3YXMgZ2l2ZW4sIHJlZ2FyZGxlc3Mgb2YgYXV0b2VzY2FwaW5nIHN0YXR1cy5cbiAqL1xuZXhwb3J0cy5zYWZlID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIC8vIFRoaXMgaXMgYSBtYWdpYyBmaWx0ZXIuIEl0cyBsb2dpYyBpcyBoYXJkLWNvZGVkIGludG8gU3dpZydzIHBhcnNlci5cbiAgcmV0dXJuIGlucHV0O1xufTtcbmV4cG9ydHMuc2FmZS5zYWZlID0gdHJ1ZTtcblxuLyoqXG4gKiBTb3J0IHRoZSBpbnB1dCBpbiBhbiBhc2NlbmRpbmcgZGlyZWN0aW9uLlxuICogSWYgZ2l2ZW4gYW4gb2JqZWN0LCB3aWxsIHJldHVybiB0aGUga2V5cyBhcyBhIHNvcnRlZCBhcnJheS5cbiAqIElmIGdpdmVuIGEgc3RyaW5nLCBlYWNoIGNoYXJhY3RlciB3aWxsIGJlIHNvcnRlZCBpbmRpdmlkdWFsbHkuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHZhbCA9IFsyLCA2LCA0XTtcbiAqIHt7IHZhbHxzb3J0IH19XG4gKiAvLyA9PiAyLDQsNlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyB2YWwgPSAnemFxJztcbiAqIHt7IHZhbHxzb3J0IH19XG4gKiAvLyA9PiBhcXpcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gdmFsID0geyBiYXI6IDEsIGZvbzogMiB9XG4gKiB7eyB2YWx8c29ydCh0cnVlKSB9fVxuICogLy8gPT4gZm9vLGJhclxuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtyZXZlcnNlPWZhbHNlXSBPdXRwdXQgaXMgZ2l2ZW4gcmV2ZXJzZS1zb3J0ZWQgaWYgdHJ1ZS5cbiAqIEByZXR1cm4geyp9ICAgICAgICBTb3J0ZWQgYXJyYXk7XG4gKi9cbmV4cG9ydHMuc29ydCA9IGZ1bmN0aW9uIChpbnB1dCwgcmV2ZXJzZSkge1xuICB2YXIgb3V0O1xuICBpZiAodXRpbHMuaXNBcnJheShpbnB1dCkpIHtcbiAgICBvdXQgPSBpbnB1dC5zb3J0KCk7XG4gIH0gZWxzZSB7XG4gICAgc3dpdGNoICh0eXBlb2YgaW5wdXQpIHtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgb3V0ID0gdXRpbHMua2V5cyhpbnB1dCkuc29ydCgpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIG91dCA9IGlucHV0LnNwbGl0KCcnKTtcbiAgICAgIGlmIChyZXZlcnNlKSB7XG4gICAgICAgIHJldHVybiBvdXQucmV2ZXJzZSgpLmpvaW4oJycpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG91dC5zb3J0KCkuam9pbignJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG91dCAmJiByZXZlcnNlKSB7XG4gICAgcmV0dXJuIG91dC5yZXZlcnNlKCk7XG4gIH1cblxuICByZXR1cm4gb3V0IHx8IGlucHV0O1xufTtcblxuLyoqXG4gKiBTdHJpcCBIVE1MIHRhZ3MuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIHN0dWZmID0gJzxwPmZvb2JhcjwvcD4nO1xuICoge3sgc3R1ZmZ8c3RyaXB0YWdzIH19XG4gKiAvLyA9PiBmb29iYXJcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICBSZXR1cm5zIHRoZSBzYW1lIG9iamVjdCBhcyB0aGUgaW5wdXQsIGJ1dCB3aXRoIGFsbCBzdHJpbmcgdmFsdWVzIHN0cmlwcGVkIG9mIHRhZ3MuXG4gKi9cbmV4cG9ydHMuc3RyaXB0YWdzID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMuc3RyaXB0YWdzLCBhcmd1bWVudHMpO1xuICBpZiAob3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcmV0dXJuIGlucHV0LnRvU3RyaW5nKCkucmVwbGFjZSgvKDwoW14+XSspPikvaWcsICcnKTtcbn07XG5cbi8qKlxuICogQ2FwaXRhbGl6ZXMgZXZlcnkgd29yZCBnaXZlbiBhbmQgbG93ZXItY2FzZXMgYWxsIG90aGVyIGxldHRlcnMuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3N0ciA9ICd0aGlzIGlzIHNvTWUgdGV4dCc7XG4gKiB7eyBteV9zdHJ8dGl0bGUgfX1cbiAqIC8vID0+IFRoaXMgSXMgU29tZSBUZXh0XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X2FyciA9IFsnaGknLCAndGhpcycsICdpcycsICdhbicsICdhcnJheSddO1xuICoge3sgbXlfYXJyfHRpdGxlfGpvaW4oJyAnKSB9fVxuICogLy8gPT4gSGkgVGhpcyBJcyBBbiBBcnJheVxuICpcbiAqIEBwYXJhbSAgeyp9ICBpbnB1dFxuICogQHJldHVybiB7Kn0gICAgICAgIFJldHVybnMgdGhlIHNhbWUgb2JqZWN0IGFzIHRoZSBpbnB1dCwgYnV0IHdpdGggYWxsIHdvcmRzIGluIHN0cmluZ3MgdGl0bGUtY2FzZWQuXG4gKi9cbmV4cG9ydHMudGl0bGUgPSBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgdmFyIG91dCA9IGl0ZXJhdGVGaWx0ZXIuYXBwbHkoZXhwb3J0cy50aXRsZSwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIHJldHVybiBpbnB1dC50b1N0cmluZygpLnJlcGxhY2UoL1xcd1xcUyovZywgZnVuY3Rpb24gKHN0cikge1xuICAgIHJldHVybiBzdHIuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHIuc3Vic3RyKDEpLnRvTG93ZXJDYXNlKCk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgYWxsIGR1cGxpY2F0ZSBpdGVtcyBmcm9tIGFuIGFycmF5LlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnIgPSBbMSwgMiwgMywgNCwgNCwgMywgMiwgMV07XG4gKiB7eyBteV9hcnJ8dW5pcXxqb2luKCcsJykgfX1cbiAqIC8vID0+IDEsMiwzLDRcbiAqXG4gKiBAcGFyYW0gIHthcnJheX0gIGlucHV0XG4gKiBAcmV0dXJuIHthcnJheX0gICAgICAgIEFycmF5IHdpdGggdW5pcXVlIGl0ZW1zLiBJZiBpbnB1dCB3YXMgbm90IGFuIGFycmF5LCB0aGUgb3JpZ2luYWwgaXRlbSBpcyByZXR1cm5lZCB1bnRvdWNoZWQuXG4gKi9cbmV4cG9ydHMudW5pcSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgcmVzdWx0O1xuXG4gIGlmICghaW5wdXQgfHwgIXV0aWxzLmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG5cbiAgcmVzdWx0ID0gW107XG4gIHV0aWxzLmVhY2goaW5wdXQsIGZ1bmN0aW9uICh2KSB7XG4gICAgaWYgKHJlc3VsdC5pbmRleE9mKHYpID09PSAtMSkge1xuICAgICAgcmVzdWx0LnB1c2godik7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQ29udmVydCB0aGUgaW5wdXQgdG8gYWxsIHVwcGVyY2FzZSBsZXR0ZXJzLiBJZiBhbiBvYmplY3Qgb3IgYXJyYXkgaXMgcHJvdmlkZWQsIGFsbCB2YWx1ZXMgd2lsbCBiZSB1cHBlcmNhc2VkLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9zdHIgPSAndGFjb3MnO1xuICoge3sgbXlfc3RyfHVwcGVyIH19XG4gKiAvLyA9PiBUQUNPU1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9hcnIgPSBbJ3RhY29zJywgJ2J1cnJpdG9zJ107XG4gKiB7eyBteV9hcnJ8dXBwZXJ8am9pbignICYgJykgfX1cbiAqIC8vID0+IFRBQ09TICYgQlVSUklUT1NcbiAqXG4gKiBAcGFyYW0gIHsqfSAgaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgICBSZXR1cm5zIHRoZSBzYW1lIHR5cGUgYXMgdGhlIGlucHV0LCB3aXRoIGFsbCBzdHJpbmdzIHVwcGVyLWNhc2VkLlxuICovXG5leHBvcnRzLnVwcGVyID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMudXBwZXIsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICByZXR1cm4gaW5wdXQudG9TdHJpbmcoKS50b1VwcGVyQ2FzZSgpO1xufTtcblxuLyoqXG4gKiBVUkwtZW5jb2RlIGEgc3RyaW5nLiBJZiBhbiBvYmplY3Qgb3IgYXJyYXkgaXMgcGFzc2VkLCBhbGwgdmFsdWVzIHdpbGwgYmUgVVJMLWVuY29kZWQuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIG15X3N0ciA9ICdwYXJhbT0xJmFub3RoZXJQYXJhbT0yJztcbiAqIHt7IG15X3N0cnx1cmxfZW5jb2RlIH19XG4gKiAvLyA9PiBwYXJhbSUzRDElMjZhbm90aGVyUGFyYW0lM0QyXG4gKlxuICogQHBhcmFtICB7Kn0gaW5wdXRcbiAqIEByZXR1cm4geyp9ICAgICAgIFVSTC1lbmNvZGVkIHN0cmluZy5cbiAqL1xuZXhwb3J0cy51cmxfZW5jb2RlID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHZhciBvdXQgPSBpdGVyYXRlRmlsdGVyLmFwcGx5KGV4cG9ydHMudXJsX2VuY29kZSwgYXJndW1lbnRzKTtcbiAgaWYgKG91dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0KTtcbn07XG5cbi8qKlxuICogVVJMLWRlY29kZSBhIHN0cmluZy4gSWYgYW4gb2JqZWN0IG9yIGFycmF5IGlzIHBhc3NlZCwgYWxsIHZhbHVlcyB3aWxsIGJlIFVSTC1kZWNvZGVkLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteV9zdHIgPSAncGFyYW0lM0QxJTI2YW5vdGhlclBhcmFtJTNEMic7XG4gKiB7eyBteV9zdHJ8dXJsX2RlY29kZSB9fVxuICogLy8gPT4gcGFyYW09MSZhbm90aGVyUGFyYW09MlxuICpcbiAqIEBwYXJhbSAgeyp9IGlucHV0XG4gKiBAcmV0dXJuIHsqfSAgICAgICBVUkwtZGVjb2RlZCBzdHJpbmcuXG4gKi9cbmV4cG9ydHMudXJsX2RlY29kZSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICB2YXIgb3V0ID0gaXRlcmF0ZUZpbHRlci5hcHBseShleHBvcnRzLnVybF9kZWNvZGUsIGFyZ3VtZW50cyk7XG4gIGlmIChvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBvdXQ7XG4gIH1cbiAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChpbnB1dCk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9maWx0ZXJzLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vKipcbiAqIEEgbGV4ZXIgdG9rZW4uXG4gKiBAdHlwZWRlZiB7b2JqZWN0fSBMZXhlclRva2VuXG4gKiBAcHJvcGVydHkge3N0cmluZ30gbWF0Y2ggIFRoZSBzdHJpbmcgdGhhdCB3YXMgbWF0Y2hlZC5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSB0eXBlICAgTGV4ZXIgdHlwZSBlbnVtLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IGxlbmd0aCBMZW5ndGggb2YgdGhlIG9yaWdpbmFsIHN0cmluZyBwcm9jZXNzZWQuXG4gKi9cblxuLyoqXG4gKiBFbnVtIGZvciB0b2tlbiB0eXBlcy5cbiAqIEByZWFkb25seVxuICogQGVudW0ge251bWJlcn1cbiAqL1xudmFyIFRZUEVTID0ge1xuICAgIC8qKiBXaGl0ZXNwYWNlICovXG4gICAgV0hJVEVTUEFDRTogMCxcbiAgICAvKiogUGxhaW4gc3RyaW5nICovXG4gICAgU1RSSU5HOiAxLFxuICAgIC8qKiBWYXJpYWJsZSBmaWx0ZXIgKi9cbiAgICBGSUxURVI6IDIsXG4gICAgLyoqIEVtcHR5IHZhcmlhYmxlIGZpbHRlciAqL1xuICAgIEZJTFRFUkVNUFRZOiAzLFxuICAgIC8qKiBGdW5jdGlvbiAqL1xuICAgIEZVTkNUSU9OOiA0LFxuICAgIC8qKiBGdW5jdGlvbiB3aXRoIG5vIGFyZ3VtZW50cyAqL1xuICAgIEZVTkNUSU9ORU1QVFk6IDUsXG4gICAgLyoqIE9wZW4gcGFyZW50aGVzaXMgKi9cbiAgICBQQVJFTk9QRU46IDYsXG4gICAgLyoqIENsb3NlIHBhcmVudGhlc2lzICovXG4gICAgUEFSRU5DTE9TRTogNyxcbiAgICAvKiogQ29tbWEgKi9cbiAgICBDT01NQTogOCxcbiAgICAvKiogVmFyaWFibGUgKi9cbiAgICBWQVI6IDksXG4gICAgLyoqIE51bWJlciAqL1xuICAgIE5VTUJFUjogMTAsXG4gICAgLyoqIE1hdGggb3BlcmF0b3IgKi9cbiAgICBPUEVSQVRPUjogMTEsXG4gICAgLyoqIE9wZW4gc3F1YXJlIGJyYWNrZXQgKi9cbiAgICBCUkFDS0VUT1BFTjogMTIsXG4gICAgLyoqIENsb3NlIHNxdWFyZSBicmFja2V0ICovXG4gICAgQlJBQ0tFVENMT1NFOiAxMyxcbiAgICAvKiogS2V5IG9uIGFuIG9iamVjdCB1c2luZyBkb3Qtbm90YXRpb24gKi9cbiAgICBET1RLRVk6IDE0LFxuICAgIC8qKiBTdGFydCBvZiBhbiBhcnJheSAqL1xuICAgIEFSUkFZT1BFTjogMTUsXG4gICAgLyoqIEVuZCBvZiBhbiBhcnJheVxuICAgICAqIEN1cnJlbnRseSB1bnVzZWRcbiAgICBBUlJBWUNMT1NFOiAxNiwgKi9cbiAgICAvKiogT3BlbiBjdXJseSBicmFjZSAqL1xuICAgIENVUkxZT1BFTjogMTcsXG4gICAgLyoqIENsb3NlIGN1cmx5IGJyYWNlICovXG4gICAgQ1VSTFlDTE9TRTogMTgsXG4gICAgLyoqIENvbG9uICg6KSAqL1xuICAgIENPTE9OOiAxOSxcbiAgICAvKiogSmF2YVNjcmlwdC12YWxpZCBjb21wYXJhdG9yICovXG4gICAgQ09NUEFSQVRPUjogMjAsXG4gICAgLyoqIEJvb2xlYW4gbG9naWMgKi9cbiAgICBMT0dJQzogMjEsXG4gICAgLyoqIEJvb2xlYW4gbG9naWMgXCJub3RcIiAqL1xuICAgIE5PVDogMjIsXG4gICAgLyoqIHRydWUgb3IgZmFsc2UgKi9cbiAgICBCT09MOiAyMyxcbiAgICAvKiogVmFyaWFibGUgYXNzaWdubWVudCAqL1xuICAgIEFTU0lHTk1FTlQ6IDI0LFxuICAgIC8qKiBTdGFydCBvZiBhIG1ldGhvZCAqL1xuICAgIE1FVEhPRE9QRU46IDI1LFxuICAgIC8qKiBFbmQgb2YgYSBtZXRob2RcbiAgICAgKiBDdXJyZW50bHkgdW51c2VkXG4gICAgTUVUSE9ERU5EOiAyNiwgKi9cbiAgICAvKiogVW5rbm93biB0eXBlICovXG4gICAgVU5LTk9XTjogMTAwXG4gIH0sXG4gIHJ1bGVzID0gW1xuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLldISVRFU1BBQ0UsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxccysvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5TVFJJTkcsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlwiXCIvLFxuICAgICAgICAvXlwiLio/W15cXFxcXVwiLyxcbiAgICAgICAgL14nJy8sXG4gICAgICAgIC9eJy4qP1teXFxcXF0nL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuRklMVEVSLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHxcXHMqKFxcdyspXFwoL1xuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuRklMVEVSRU1QVFksXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcfFxccyooXFx3KykvXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5GVU5DVElPTkVNUFRZLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXHMqKFxcdyspXFwoXFwpL1xuICAgICAgXSxcbiAgICAgIGlkeDogMVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuRlVOQ1RJT04sXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxccyooXFx3KylcXCgvXG4gICAgICBdLFxuICAgICAgaWR4OiAxXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5QQVJFTk9QRU4sXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcKC9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLlBBUkVOQ0xPU0UsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcKS9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkNPTU1BLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL14sL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuTE9HSUMsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXigmJnxcXHxcXHwpXFxzKi8sXG4gICAgICAgIC9eKGFuZHxvcilcXHMrL1xuICAgICAgXSxcbiAgICAgIGlkeDogMSxcbiAgICAgIHJlcGxhY2U6IHtcbiAgICAgICAgJ2FuZCc6ICcmJicsXG4gICAgICAgICdvcic6ICd8fCdcbiAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkNPTVBBUkFUT1IsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXig9PT18PT18XFwhPT18XFwhPXw8PXw8fD49fD58aW5cXHN8Z3RlXFxzfGd0XFxzfGx0ZVxcc3xsdFxccylcXHMqL1xuICAgICAgXSxcbiAgICAgIGlkeDogMSxcbiAgICAgIHJlcGxhY2U6IHtcbiAgICAgICAgJ2d0ZSc6ICc+PScsXG4gICAgICAgICdndCc6ICc+JyxcbiAgICAgICAgJ2x0ZSc6ICc8PScsXG4gICAgICAgICdsdCc6ICc8J1xuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQVNTSUdOTUVOVCxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eKD18XFwrPXwtPXxcXCo9fFxcLz0pL1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuTk9ULFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXCFcXHMqLyxcbiAgICAgICAgL15ub3RcXHMrL1xuICAgICAgXSxcbiAgICAgIHJlcGxhY2U6IHtcbiAgICAgICAgJ25vdCc6ICchJ1xuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQk9PTCxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eKHRydWV8ZmFsc2UpXFxzKy8sXG4gICAgICAgIC9eKHRydWV8ZmFsc2UpJC9cbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLlZBUixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eW2EtekEtWl8kXVxcdyooKFxcLlxcdyopKyk/LyxcbiAgICAgICAgL15bYS16QS1aXyRdXFx3Ki9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkJSQUNLRVRPUEVOLFxuICAgICAgcmVnZXg6IFtcbiAgICAgICAgL15cXFsvXG4gICAgICBdXG4gICAgfSxcbiAgICB7XG4gICAgICB0eXBlOiBUWVBFUy5CUkFDS0VUQ0xPU0UsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcXS9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkNVUkxZT1BFTixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFx7L1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuQ09MT04sXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcOi9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkNVUkxZQ0xPU0UsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXlxcfS9cbiAgICAgIF1cbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLkRPVEtFWSxcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eXFwuKFxcdyspLyxcbiAgICAgIF0sXG4gICAgICBpZHg6IDFcbiAgICB9LFxuICAgIHtcbiAgICAgIHR5cGU6IFRZUEVTLk5VTUJFUixcbiAgICAgIHJlZ2V4OiBbXG4gICAgICAgIC9eWytcXC1dP1xcZCsoXFwuXFxkKyk/L1xuICAgICAgXVxuICAgIH0sXG4gICAge1xuICAgICAgdHlwZTogVFlQRVMuT1BFUkFUT1IsXG4gICAgICByZWdleDogW1xuICAgICAgICAvXihcXCt8XFwtfFxcL3xcXCp8JSkvXG4gICAgICBdXG4gICAgfVxuICBdO1xuXG5leHBvcnRzLnR5cGVzID0gVFlQRVM7XG5cbi8qKlxuICogUmV0dXJuIHRoZSB0b2tlbiB0eXBlIG9iamVjdCBmb3IgYSBzaW5nbGUgY2h1bmsgb2YgYSBzdHJpbmcuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN0ciBTdHJpbmcgY2h1bmsuXG4gKiBAcmV0dXJuIHtMZXhlclRva2VufSAgICAgRGVmaW5lZCB0eXBlLCBwb3RlbnRpYWxseSBzdHJpcHBlZCBvciByZXBsYWNlZCB3aXRoIG1vcmUgc3VpdGFibGUgY29udGVudC5cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlYWRlcihzdHIpIHtcbiAgdmFyIG1hdGNoZWQ7XG5cbiAgdXRpbHMuc29tZShydWxlcywgZnVuY3Rpb24gKHJ1bGUpIHtcbiAgICByZXR1cm4gdXRpbHMuc29tZShydWxlLnJlZ2V4LCBmdW5jdGlvbiAocmVnZXgpIHtcbiAgICAgIHZhciBtYXRjaCA9IHN0ci5tYXRjaChyZWdleCksXG4gICAgICAgIG5vcm1hbGl6ZWQ7XG5cbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBub3JtYWxpemVkID0gbWF0Y2hbcnVsZS5pZHggfHwgMF0ucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG4gICAgICBub3JtYWxpemVkID0gKHJ1bGUuaGFzT3duUHJvcGVydHkoJ3JlcGxhY2UnKSAmJiBydWxlLnJlcGxhY2UuaGFzT3duUHJvcGVydHkobm9ybWFsaXplZCkpID8gcnVsZS5yZXBsYWNlW25vcm1hbGl6ZWRdIDogbm9ybWFsaXplZDtcblxuICAgICAgbWF0Y2hlZCA9IHtcbiAgICAgICAgbWF0Y2g6IG5vcm1hbGl6ZWQsXG4gICAgICAgIHR5cGU6IHJ1bGUudHlwZSxcbiAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcbiAgICAgIH07XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgaWYgKCFtYXRjaGVkKSB7XG4gICAgbWF0Y2hlZCA9IHtcbiAgICAgIG1hdGNoOiBzdHIsXG4gICAgICB0eXBlOiBUWVBFUy5VTktOT1dOLFxuICAgICAgbGVuZ3RoOiBzdHIubGVuZ3RoXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBtYXRjaGVkO1xufVxuXG4vKipcbiAqIFJlYWQgYSBzdHJpbmcgYW5kIGJyZWFrIGl0IGludG8gc2VwYXJhdGUgdG9rZW4gdHlwZXMuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN0clxuICogQHJldHVybiB7QXJyYXkuTGV4ZXJUb2tlbn0gICAgIEFycmF5IG9mIGRlZmluZWQgdHlwZXMsIHBvdGVudGlhbGx5IHN0cmlwcGVkIG9yIHJlcGxhY2VkIHdpdGggbW9yZSBzdWl0YWJsZSBjb250ZW50LlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24gKHN0cikge1xuICB2YXIgb2Zmc2V0ID0gMCxcbiAgICB0b2tlbnMgPSBbXSxcbiAgICBzdWJzdHIsXG4gICAgbWF0Y2g7XG4gIHdoaWxlIChvZmZzZXQgPCBzdHIubGVuZ3RoKSB7XG4gICAgc3Vic3RyID0gc3RyLnN1YnN0cmluZyhvZmZzZXQpO1xuICAgIG1hdGNoID0gcmVhZGVyKHN1YnN0cik7XG4gICAgb2Zmc2V0ICs9IG1hdGNoLmxlbmd0aDtcbiAgICB0b2tlbnMucHVzaChtYXRjaCk7XG4gIH1cbiAgcmV0dXJuIHRva2Vucztcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xleGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGZzID0gcmVxdWlyZSgnZnMnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuLyoqXG4gKiBMb2FkcyB0ZW1wbGF0ZXMgZnJvbSB0aGUgZmlsZSBzeXN0ZW0uXG4gKiBAYWxpYXMgc3dpZy5sb2FkZXJzLmZzXG4gKiBAZXhhbXBsZVxuICogc3dpZy5zZXREZWZhdWx0cyh7IGxvYWRlcjogc3dpZy5sb2FkZXJzLmZzKCkgfSk7XG4gKiBAZXhhbXBsZVxuICogLy8gTG9hZCBUZW1wbGF0ZXMgZnJvbSBhIHNwZWNpZmljIGRpcmVjdG9yeSAoZG9lcyBub3QgcmVxdWlyZSB1c2luZyByZWxhdGl2ZSBwYXRocyBpbiB5b3VyIHRlbXBsYXRlcylcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5mcyhfX2Rpcm5hbWUgKyAnL3RlbXBsYXRlcycgKX0pO1xuICogQHBhcmFtIHtzdHJpbmd9ICAgW2Jhc2VwYXRoPScnXSAgICAgUGF0aCB0byB0aGUgdGVtcGxhdGVzIGFzIHN0cmluZy4gQXNzaWduaW5nIHRoaXMgdmFsdWUgYWxsb3dzIHlvdSB0byB1c2Ugc2VtaS1hYnNvbHV0ZSBwYXRocyB0byB0ZW1wbGF0ZXMgaW5zdGVhZCBvZiByZWxhdGl2ZSBwYXRocy5cbiAqIEBwYXJhbSB7c3RyaW5nfSAgIFtlbmNvZGluZz0ndXRmOCddICAgVGVtcGxhdGUgZW5jb2RpbmdcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYmFzZXBhdGgsIGVuY29kaW5nKSB7XG4gIHZhciByZXQgPSB7fTtcblxuICBlbmNvZGluZyA9IGVuY29kaW5nIHx8ICd1dGY4JztcbiAgYmFzZXBhdGggPSAoYmFzZXBhdGgpID8gcGF0aC5ub3JtYWxpemUoYmFzZXBhdGgpIDogbnVsbDtcblxuICAvKipcbiAgICogUmVzb2x2ZXMgPHZhcj50bzwvdmFyPiB0byBhbiBhYnNvbHV0ZSBwYXRoIG9yIHVuaXF1ZSBpZGVudGlmaWVyLiBUaGlzIGlzIHVzZWQgZm9yIGJ1aWxkaW5nIGNvcnJlY3QsIG5vcm1hbGl6ZWQsIGFuZCBhYnNvbHV0ZSBwYXRocyB0byBhIGdpdmVuIHRlbXBsYXRlLlxuICAgKiBAYWxpYXMgcmVzb2x2ZVxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHRvICAgICAgICBOb24tYWJzb2x1dGUgaWRlbnRpZmllciBvciBwYXRobmFtZSB0byBhIGZpbGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gW2Zyb21dICAgIElmIGdpdmVuLCBzaG91bGQgYXR0ZW1wdCB0byBmaW5kIHRoZSA8dmFyPnRvPC92YXI+IHBhdGggaW4gcmVsYXRpb24gdG8gdGhpcyBnaXZlbiwga25vd24gcGF0aC5cbiAgICogQHJldHVybiB7c3RyaW5nfVxuICAgKi9cbiAgcmV0LnJlc29sdmUgPSBmdW5jdGlvbiAodG8sIGZyb20pIHtcbiAgICBpZiAoYmFzZXBhdGgpIHtcbiAgICAgIGZyb20gPSBiYXNlcGF0aDtcbiAgICB9IGVsc2Uge1xuICAgICAgZnJvbSA9IChmcm9tKSA/IHBhdGguZGlybmFtZShmcm9tKSA6ICcvJztcbiAgICB9XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShmcm9tLCB0byk7XG4gIH07XG5cbiAgLyoqXG4gICAqIExvYWRzIGEgc2luZ2xlIHRlbXBsYXRlLiBHaXZlbiBhIHVuaXF1ZSA8dmFyPmlkZW50aWZpZXI8L3Zhcj4gZm91bmQgYnkgdGhlIDx2YXI+cmVzb2x2ZTwvdmFyPiBtZXRob2QgdGhpcyBzaG91bGQgcmV0dXJuIHRoZSBnaXZlbiB0ZW1wbGF0ZS5cbiAgICogQGFsaWFzIGxvYWRcbiAgICogQHBhcmFtICB7c3RyaW5nfSAgIGlkZW50aWZpZXIgIFVuaXF1ZSBpZGVudGlmaWVyIG9mIGEgdGVtcGxhdGUgKHBvc3NpYmx5IGFuIGFic29sdXRlIHBhdGgpLlxuICAgKiBAcGFyYW0gIHtmdW5jdGlvbn0gW2NiXSAgICAgICAgQXN5bmNocm9ub3VzIGNhbGxiYWNrIGZ1bmN0aW9uLiBJZiBub3QgcHJvdmlkZWQsIHRoaXMgbWV0aG9kIHNob3VsZCBydW4gc3luY2hyb25vdXNseS5cbiAgICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICAgIFRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gICAqL1xuICByZXQubG9hZCA9IGZ1bmN0aW9uIChpZGVudGlmaWVyLCBjYikge1xuICAgIGlmICghZnMgfHwgKGNiICYmICFmcy5yZWFkRmlsZSkgfHwgIWZzLnJlYWRGaWxlU3luYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZmluZCBmaWxlICcgKyBpZGVudGlmaWVyICsgJyBiZWNhdXNlIHRoZXJlIGlzIG5vIGZpbGVzeXN0ZW0gdG8gcmVhZCBmcm9tLicpO1xuICAgIH1cblxuICAgIGlkZW50aWZpZXIgPSByZXQucmVzb2x2ZShpZGVudGlmaWVyKTtcblxuICAgIGlmIChjYikge1xuICAgICAgZnMucmVhZEZpbGUoaWRlbnRpZmllciwgZW5jb2RpbmcsIGNiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIGZzLnJlYWRGaWxlU3luYyhpZGVudGlmaWVyLCBlbmNvZGluZyk7XG4gIH07XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvZmlsZXN5c3RlbS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9sb2FkZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBAbmFtZXNwYWNlIFRlbXBsYXRlTG9hZGVyXG4gKiBAZGVzY3JpcHRpb24gU3dpZyBpcyBhYmxlIHRvIGFjY2VwdCBjdXN0b20gdGVtcGxhdGUgbG9hZGVycyB3cml0dGVuIGJ5IHlvdSwgc28gdGhhdCB5b3VyIHRlbXBsYXRlcyBjYW4gY29tZSBmcm9tIHlvdXIgZmF2b3JpdGUgc3RvcmFnZSBtZWRpdW0gd2l0aG91dCBuZWVkaW5nIHRvIGJlIHBhcnQgb2YgdGhlIGNvcmUgbGlicmFyeS5cbiAqIEEgdGVtcGxhdGUgbG9hZGVyIGNvbnNpc3RzIG9mIHR3byBtZXRob2RzOiA8dmFyPnJlc29sdmU8L3Zhcj4gYW5kIDx2YXI+bG9hZDwvdmFyPi4gRWFjaCBtZXRob2QgaXMgdXNlZCBpbnRlcm5hbGx5IGJ5IFN3aWcgdG8gZmluZCBhbmQgbG9hZCB0aGUgc291cmNlIG9mIHRoZSB0ZW1wbGF0ZSBiZWZvcmUgYXR0ZW1wdGluZyB0byBwYXJzZSBhbmQgY29tcGlsZSBpdC5cbiAqIEBleGFtcGxlXG4gKiAvLyBBIHRoZW9yZXRpY2FsIG1lbWNhY2hlZCBsb2FkZXJcbiAqIHZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICogICBNZW1jYWNoZWQgPSByZXF1aXJlKCdtZW1jYWNoZWQnKTtcbiAqIGZ1bmN0aW9uIG1lbWNhY2hlZExvYWRlcihsb2NhdGlvbnMsIG9wdGlvbnMpIHtcbiAqICAgdmFyIG1lbWNhY2hlZCA9IG5ldyBNZW1jYWNoZWQobG9jYXRpb25zLCBvcHRpb25zKTtcbiAqICAgcmV0dXJuIHtcbiAqICAgICByZXNvbHZlOiBmdW5jdGlvbiAodG8sIGZyb20pIHtcbiAqICAgICAgIHJldHVybiBwYXRoLnJlc29sdmUoZnJvbSwgdG8pO1xuICogICAgIH0sXG4gKiAgICAgbG9hZDogZnVuY3Rpb24gKGlkZW50aWZpZXIsIGNiKSB7XG4gKiAgICAgICBtZW1jYWNoZWQuZ2V0KGlkZW50aWZpZXIsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAqICAgICAgICAgLy8gaWYgKCFkYXRhKSB7IGxvYWQgZnJvbSBmaWxlc3lzdGVtOyB9XG4gKiAgICAgICAgIGNiKGVyciwgZGF0YSk7XG4gKiAgICAgICB9KTtcbiAqICAgICB9XG4gKiAgIH07XG4gKiB9O1xuICogLy8gVGVsbCBzd2lnIGFib3V0IHRoZSBsb2FkZXI6XG4gKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBtZW1jYWNoZWRMb2FkZXIoWycxOTIuMTY4LjAuMiddKSB9KTtcbiAqL1xuXG4vKipcbiAqIEBmdW5jdGlvblxuICogQG5hbWUgcmVzb2x2ZVxuICogQG1lbWJlcm9mIFRlbXBsYXRlTG9hZGVyXG4gKiBAZGVzY3JpcHRpb25cbiAqIFJlc29sdmVzIDx2YXI+dG88L3Zhcj4gdG8gYW4gYWJzb2x1dGUgcGF0aCBvciB1bmlxdWUgaWRlbnRpZmllci4gVGhpcyBpcyB1c2VkIGZvciBidWlsZGluZyBjb3JyZWN0LCBub3JtYWxpemVkLCBhbmQgYWJzb2x1dGUgcGF0aHMgdG8gYSBnaXZlbiB0ZW1wbGF0ZS5cbiAqIEBwYXJhbSAge3N0cmluZ30gdG8gICAgICAgIE5vbi1hYnNvbHV0ZSBpZGVudGlmaWVyIG9yIHBhdGhuYW1lIHRvIGEgZmlsZS5cbiAqIEBwYXJhbSAge3N0cmluZ30gW2Zyb21dICAgIElmIGdpdmVuLCBzaG91bGQgYXR0ZW1wdCB0byBmaW5kIHRoZSA8dmFyPnRvPC92YXI+IHBhdGggaW4gcmVsYXRpb24gdG8gdGhpcyBnaXZlbiwga25vd24gcGF0aC5cbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuXG4vKipcbiAqIEBmdW5jdGlvblxuICogQG5hbWUgbG9hZFxuICogQG1lbWJlcm9mIFRlbXBsYXRlTG9hZGVyXG4gKiBAZGVzY3JpcHRpb25cbiAqIExvYWRzIGEgc2luZ2xlIHRlbXBsYXRlLiBHaXZlbiBhIHVuaXF1ZSA8dmFyPmlkZW50aWZpZXI8L3Zhcj4gZm91bmQgYnkgdGhlIDx2YXI+cmVzb2x2ZTwvdmFyPiBtZXRob2QgdGhpcyBzaG91bGQgcmV0dXJuIHRoZSBnaXZlbiB0ZW1wbGF0ZS5cbiAqIEBwYXJhbSAge3N0cmluZ30gICBpZGVudGlmaWVyICBVbmlxdWUgaWRlbnRpZmllciBvZiBhIHRlbXBsYXRlIChwb3NzaWJseSBhbiBhYnNvbHV0ZSBwYXRoKS5cbiAqIEBwYXJhbSAge2Z1bmN0aW9ufSBbY2JdICAgICAgICBBc3luY2hyb25vdXMgY2FsbGJhY2sgZnVuY3Rpb24uIElmIG5vdCBwcm92aWRlZCwgdGhpcyBtZXRob2Qgc2hvdWxkIHJ1biBzeW5jaHJvbm91c2x5LlxuICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgICAgIFRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gKi9cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnRzLmZzID0gcmVxdWlyZSgnLi9maWxlc3lzdGVtJyk7XG5leHBvcnRzLm1lbW9yeSA9IHJlcXVpcmUoJy4vbWVtb3J5Jyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL2xvYWRlcnMvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogTG9hZHMgdGVtcGxhdGVzIGZyb20gYSBwcm92aWRlZCBvYmplY3QgbWFwcGluZy5cbiAqIEBhbGlhcyBzd2lnLmxvYWRlcnMubWVtb3J5XG4gKiBAZXhhbXBsZVxuICogdmFyIHRlbXBsYXRlcyA9IHtcbiAqICAgXCJsYXlvdXRcIjogXCJ7JSBibG9jayBjb250ZW50ICV9eyUgZW5kYmxvY2sgJX1cIixcbiAqICAgXCJob21lLmh0bWxcIjogXCJ7JSBleHRlbmRzICdsYXlvdXQuaHRtbCcgJX17JSBibG9jayBjb250ZW50ICV9Li4ueyUgZW5kYmxvY2sgJX1cIlxuICogfTtcbiAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5tZW1vcnkodGVtcGxhdGVzKSB9KTtcbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gbWFwcGluZyBIYXNoIG9iamVjdCB3aXRoIHRlbXBsYXRlIHBhdGhzIGFzIGtleXMgYW5kIHRlbXBsYXRlIHNvdXJjZXMgYXMgdmFsdWVzLlxuICogQHBhcmFtIHtzdHJpbmd9IFtiYXNlcGF0aF0gUGF0aCB0byB0aGUgdGVtcGxhdGVzIGFzIHN0cmluZy4gQXNzaWduaW5nIHRoaXMgdmFsdWUgYWxsb3dzIHlvdSB0byB1c2Ugc2VtaS1hYnNvbHV0ZSBwYXRocyB0byB0ZW1wbGF0ZXMgaW5zdGVhZCBvZiByZWxhdGl2ZSBwYXRocy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobWFwcGluZywgYmFzZXBhdGgpIHtcbiAgdmFyIHJldCA9IHt9O1xuXG4gIGJhc2VwYXRoID0gKGJhc2VwYXRoKSA/IHBhdGgubm9ybWFsaXplKGJhc2VwYXRoKSA6IG51bGw7XG5cbiAgLyoqXG4gICAqIFJlc29sdmVzIDx2YXI+dG88L3Zhcj4gdG8gYW4gYWJzb2x1dGUgcGF0aCBvciB1bmlxdWUgaWRlbnRpZmllci4gVGhpcyBpcyB1c2VkIGZvciBidWlsZGluZyBjb3JyZWN0LCBub3JtYWxpemVkLCBhbmQgYWJzb2x1dGUgcGF0aHMgdG8gYSBnaXZlbiB0ZW1wbGF0ZS5cbiAgICogQGFsaWFzIHJlc29sdmVcbiAgICogQHBhcmFtICB7c3RyaW5nfSB0byAgICAgICAgTm9uLWFic29sdXRlIGlkZW50aWZpZXIgb3IgcGF0aG5hbWUgdG8gYSBmaWxlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IFtmcm9tXSAgICBJZiBnaXZlbiwgc2hvdWxkIGF0dGVtcHQgdG8gZmluZCB0aGUgPHZhcj50bzwvdmFyPiBwYXRoIGluIHJlbGF0aW9uIHRvIHRoaXMgZ2l2ZW4sIGtub3duIHBhdGguXG4gICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICovXG4gIHJldC5yZXNvbHZlID0gZnVuY3Rpb24gKHRvLCBmcm9tKSB7XG4gICAgaWYgKGJhc2VwYXRoKSB7XG4gICAgICBmcm9tID0gYmFzZXBhdGg7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZyb20gPSAoZnJvbSkgPyBwYXRoLmRpcm5hbWUoZnJvbSkgOiAnLyc7XG4gICAgfVxuICAgIHJldHVybiBwYXRoLnJlc29sdmUoZnJvbSwgdG8pO1xuICB9O1xuXG4gIC8qKlxuICAgKiBMb2FkcyBhIHNpbmdsZSB0ZW1wbGF0ZS4gR2l2ZW4gYSB1bmlxdWUgPHZhcj5pZGVudGlmaWVyPC92YXI+IGZvdW5kIGJ5IHRoZSA8dmFyPnJlc29sdmU8L3Zhcj4gbWV0aG9kIHRoaXMgc2hvdWxkIHJldHVybiB0aGUgZ2l2ZW4gdGVtcGxhdGUuXG4gICAqIEBhbGlhcyBsb2FkXG4gICAqIEBwYXJhbSAge3N0cmluZ30gICBpZGVudGlmaWVyICBVbmlxdWUgaWRlbnRpZmllciBvZiBhIHRlbXBsYXRlIChwb3NzaWJseSBhbiBhYnNvbHV0ZSBwYXRoKS5cbiAgICogQHBhcmFtICB7ZnVuY3Rpb259IFtjYl0gICAgICAgIEFzeW5jaHJvbm91cyBjYWxsYmFjayBmdW5jdGlvbi4gSWYgbm90IHByb3ZpZGVkLCB0aGlzIG1ldGhvZCBzaG91bGQgcnVuIHN5bmNocm9ub3VzbHkuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgICBUZW1wbGF0ZSBzb3VyY2Ugc3RyaW5nLlxuICAgKi9cbiAgcmV0LmxvYWQgPSBmdW5jdGlvbiAocGF0aG5hbWUsIGNiKSB7XG4gICAgdmFyIHNyYywgcGF0aHM7XG5cbiAgICBwYXRocyA9IFtwYXRobmFtZSwgcGF0aG5hbWUucmVwbGFjZSgvXihcXC98XFxcXCkvLCAnJyldO1xuXG4gICAgc3JjID0gbWFwcGluZ1twYXRoc1swXV0gfHwgbWFwcGluZ1twYXRoc1sxXV07XG4gICAgaWYgKCFzcmMpIHtcbiAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuYWJsZSB0byBmaW5kIHRlbXBsYXRlIFwiJyArIHBhdGhuYW1lICsgJ1wiLicpO1xuICAgIH1cblxuICAgIGlmIChjYikge1xuICAgICAgY2IobnVsbCwgc3JjKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHNyYztcbiAgfTtcblxuICByZXR1cm4gcmV0O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVycy9tZW1vcnkuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvbG9hZGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKSxcbiAgbGV4ZXIgPSByZXF1aXJlKCcuL2xleGVyJyk7XG5cbnZhciBfdCA9IGxleGVyLnR5cGVzLFxuICBfcmVzZXJ2ZWQgPSBbJ2JyZWFrJywgJ2Nhc2UnLCAnY2F0Y2gnLCAnY29udGludWUnLCAnZGVidWdnZXInLCAnZGVmYXVsdCcsICdkZWxldGUnLCAnZG8nLCAnZWxzZScsICdmaW5hbGx5JywgJ2ZvcicsICdmdW5jdGlvbicsICdpZicsICdpbicsICdpbnN0YW5jZW9mJywgJ25ldycsICdyZXR1cm4nLCAnc3dpdGNoJywgJ3RoaXMnLCAndGhyb3cnLCAndHJ5JywgJ3R5cGVvZicsICd2YXInLCAndm9pZCcsICd3aGlsZScsICd3aXRoJ107XG5cblxuLyoqXG4gKiBGaWx0ZXJzIGFyZSBzaW1wbHkgZnVuY3Rpb25zIHRoYXQgcGVyZm9ybSB0cmFuc2Zvcm1hdGlvbnMgb24gdGhlaXIgZmlyc3QgaW5wdXQgYXJndW1lbnQuXG4gKiBGaWx0ZXJzIGFyZSBydW4gYXQgcmVuZGVyIHRpbWUsIHNvIHRoZXkgbWF5IG5vdCBkaXJlY3RseSBtb2RpZnkgdGhlIGNvbXBpbGVkIHRlbXBsYXRlIHN0cnVjdHVyZSBpbiBhbnkgd2F5LlxuICogQWxsIG9mIFN3aWcncyBidWlsdC1pbiBmaWx0ZXJzIGFyZSB3cml0dGVuIGluIHRoaXMgc2FtZSB3YXkuIEZvciBtb3JlIGV4YW1wbGVzLCByZWZlcmVuY2UgdGhlIGBmaWx0ZXJzLmpzYCBmaWxlIGluIFN3aWcncyBzb3VyY2UuXG4gKlxuICogVG8gZGlzYWJsZSBhdXRvLWVzY2FwaW5nIG9uIGEgY3VzdG9tIGZpbHRlciwgc2ltcGx5IGFkZCBhIHByb3BlcnR5IHRvIHRoZSBmaWx0ZXIgbWV0aG9kIGBzYWZlID0gdHJ1ZTtgIGFuZCB0aGUgb3V0cHV0IGZyb20gdGhpcyB3aWxsIG5vdCBiZSBlc2NhcGVkLCBubyBtYXR0ZXIgd2hhdCB0aGUgZ2xvYmFsIHNldHRpbmdzIGFyZSBmb3IgU3dpZy5cbiAqXG4gKiBAdHlwZWRlZiB7ZnVuY3Rpb259IEZpbHRlclxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBUaGlzIGZpbHRlciB3aWxsIHJldHVybiAnYmF6Ym9wJyBpZiB0aGUgaWR4IG9uIHRoZSBpbnB1dCBpcyBub3QgJ2Zvb2JhcidcbiAqIHN3aWcuc2V0RmlsdGVyKCdmb29iYXInLCBmdW5jdGlvbiAoaW5wdXQsIGlkeCkge1xuICogICByZXR1cm4gaW5wdXRbaWR4XSA9PT0gJ2Zvb2JhcicgPyBpbnB1dFtpZHhdIDogJ2JhemJvcCc7XG4gKiB9KTtcbiAqIC8vIG15dmFyID0gWydmb28nLCAnYmFyJywgJ2JheicsICdib3AnXTtcbiAqIC8vID0+IHt7IG15dmFyfGZvb2JhcigzKSB9fVxuICogLy8gU2luY2UgbXl2YXJbM10gIT09ICdmb29iYXInLCB3ZSByZW5kZXI6XG4gKiAvLyA9PiBiYXpib3BcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gVGhpcyBmaWx0ZXIgd2lsbCBkaXNhYmxlIGF1dG8tZXNjYXBpbmcgb24gaXRzIG91dHB1dDpcbiAqIGZ1bmN0aW9uIGJhemJvcCAoaW5wdXQpIHsgcmV0dXJuIGlucHV0OyB9XG4gKiBiYXpib3Auc2FmZSA9IHRydWU7XG4gKiBzd2lnLnNldEZpbHRlcignYmF6Ym9wJywgYmF6Ym9wKTtcbiAqIC8vID0+IHt7IFwiPHA+XCJ8YmF6Ym9wIH19XG4gKiAvLyA9PiA8cD5cbiAqXG4gKiBAcGFyYW0geyp9IGlucHV0IElucHV0IGFyZ3VtZW50LCBhdXRvbWF0aWNhbGx5IHNlbnQgZnJvbSBTd2lnJ3MgYnVpbHQtaW4gcGFyc2VyLlxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10gQWxsIG90aGVyIGFyZ3VtZW50cyBhcmUgZGVmaW5lZCBieSB0aGUgRmlsdGVyIGF1dGhvci5cbiAqIEByZXR1cm4geyp9XG4gKi9cblxuLyohXG4gKiBNYWtlcyBhIHN0cmluZyBzYWZlIGZvciBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAqIEBwYXJhbSAge3N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHAoc3RyKSB7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvW1xcLVxcL1xcXFxcXF4kKis/LigpfFxcW1xcXXt9XS9nLCAnXFxcXCQmJyk7XG59XG5cbi8qKlxuICogUGFyc2Ugc3RyaW5ncyBvZiB2YXJpYWJsZXMgYW5kIHRhZ3MgaW50byB0b2tlbnMgZm9yIGZ1dHVyZSBjb21waWxhdGlvbi5cbiAqIEBjbGFzc1xuICogQHBhcmFtIHthcnJheX0gICB0b2tlbnMgICAgIFByZS1zcGxpdCB0b2tlbnMgcmVhZCBieSB0aGUgTGV4ZXIuXG4gKiBAcGFyYW0ge29iamVjdH0gIGZpbHRlcnMgICAgS2V5ZWQgb2JqZWN0IG9mIGZpbHRlcnMgdGhhdCBtYXkgYmUgYXBwbGllZCB0byB2YXJpYWJsZXMuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGF1dG9lc2NhcGUgV2hldGhlciBvciBub3QgdGhpcyBzaG91bGQgYmUgYXV0b2VzY2FwZWQuXG4gKiBAcGFyYW0ge251bWJlcn0gIGxpbmUgICAgICAgQmVnaW5uaW5nIGxpbmUgbnVtYmVyIGZvciB0aGUgZmlyc3QgdG9rZW4uXG4gKiBAcGFyYW0ge3N0cmluZ30gIFtmaWxlbmFtZV0gTmFtZSBvZiB0aGUgZmlsZSBiZWluZyBwYXJzZWQuXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBUb2tlblBhcnNlcih0b2tlbnMsIGZpbHRlcnMsIGF1dG9lc2NhcGUsIGxpbmUsIGZpbGVuYW1lKSB7XG4gIHRoaXMub3V0ID0gW107XG4gIHRoaXMuc3RhdGUgPSBbXTtcbiAgdGhpcy5maWx0ZXJBcHBseUlkeCA9IFtdO1xuICB0aGlzLl9wYXJzZXJzID0ge307XG4gIHRoaXMubGluZSA9IGxpbmU7XG4gIHRoaXMuZmlsZW5hbWUgPSBmaWxlbmFtZTtcbiAgdGhpcy5maWx0ZXJzID0gZmlsdGVycztcbiAgdGhpcy5lc2NhcGUgPSBhdXRvZXNjYXBlO1xuXG4gIHRoaXMucGFyc2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKHNlbGYuX3BhcnNlcnMuc3RhcnQpIHtcbiAgICAgIHNlbGYuX3BhcnNlcnMuc3RhcnQuY2FsbChzZWxmKTtcbiAgICB9XG4gICAgdXRpbHMuZWFjaCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbiwgaSkge1xuICAgICAgdmFyIHByZXZUb2tlbiA9IHRva2Vuc1tpIC0gMV07XG4gICAgICBzZWxmLmlzTGFzdCA9IChpID09PSB0b2tlbnMubGVuZ3RoIC0gMSk7XG4gICAgICBpZiAocHJldlRva2VuKSB7XG4gICAgICAgIHdoaWxlIChwcmV2VG9rZW4udHlwZSA9PT0gX3QuV0hJVEVTUEFDRSkge1xuICAgICAgICAgIGkgLT0gMTtcbiAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbnNbaSAtIDFdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZWxmLnByZXZUb2tlbiA9IHByZXZUb2tlbjtcbiAgICAgIHNlbGYucGFyc2VUb2tlbih0b2tlbik7XG4gICAgfSk7XG4gICAgaWYgKHNlbGYuX3BhcnNlcnMuZW5kKSB7XG4gICAgICBzZWxmLl9wYXJzZXJzLmVuZC5jYWxsKHNlbGYpO1xuICAgIH1cblxuICAgIGlmIChzZWxmLmVzY2FwZSkge1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeCA9IFswXTtcbiAgICAgIGlmICh0eXBlb2Ygc2VsZi5lc2NhcGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHNlbGYucGFyc2VUb2tlbih7IHR5cGU6IF90LkZJTFRFUiwgbWF0Y2g6ICdlJyB9KTtcbiAgICAgICAgc2VsZi5wYXJzZVRva2VuKHsgdHlwZTogX3QuQ09NTUEsIG1hdGNoOiAnLCcgfSk7XG4gICAgICAgIHNlbGYucGFyc2VUb2tlbih7IHR5cGU6IF90LlNUUklORywgbWF0Y2g6IFN0cmluZyhhdXRvZXNjYXBlKSB9KTtcbiAgICAgICAgc2VsZi5wYXJzZVRva2VuKHsgdHlwZTogX3QuUEFSRU5DTE9TRSwgbWF0Y2g6ICcpJ30pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5wYXJzZVRva2VuKHsgdHlwZTogX3QuRklMVEVSRU1QVFksIG1hdGNoOiAnZScgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGYub3V0O1xuICB9O1xufVxuXG5Ub2tlblBhcnNlci5wcm90b3R5cGUgPSB7XG4gIC8qKlxuICAgKiBTZXQgYSBjdXN0b20gbWV0aG9kIHRvIGJlIGNhbGxlZCB3aGVuIGEgdG9rZW4gdHlwZSBpcyBmb3VuZC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogcGFyc2VyLm9uKHR5cGVzLlNUUklORywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAqICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAqIH0pO1xuICAgKiBAZXhhbXBsZVxuICAgKiBwYXJzZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24gKCkge1xuICAgKiAgIHRoaXMub3V0LnB1c2goJ3NvbWV0aGluZyBhdCB0aGUgYmVnaW5uaW5nIG9mIHlvdXIgYXJncycpXG4gICAqIH0pO1xuICAgKiBwYXJzZXIub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICogICB0aGlzLm91dC5wdXNoKCdzb21ldGhpbmcgYXQgdGhlIGVuZCBvZiB5b3VyIGFyZ3MnKTtcbiAgICogfSk7XG4gICAqXG4gICAqIEBwYXJhbSAge251bWJlcn0gICB0eXBlIFRva2VuIHR5cGUgSUQuIEZvdW5kIGluIHRoZSBMZXhlci5cbiAgICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgQ2FsbGJhY2sgZnVuY3Rpb24uIFJldHVybiB0cnVlIHRvIGNvbnRpbnVlIGV4ZWN1dGluZyB0aGUgZGVmYXVsdCBwYXJzaW5nIGZ1bmN0aW9uLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqL1xuICBvbjogZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgdGhpcy5fcGFyc2Vyc1t0eXBlXSA9IGZuO1xuICB9LFxuXG4gIC8qKlxuICAgKiBQYXJzZSBhIHNpbmdsZSB0b2tlbi5cbiAgICogQHBhcmFtICB7e21hdGNoOiBzdHJpbmcsIHR5cGU6IG51bWJlciwgbGluZTogbnVtYmVyfX0gdG9rZW4gTGV4ZXIgdG9rZW4gb2JqZWN0LlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwYXJzZVRva2VuOiBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICBmbiA9IHNlbGYuX3BhcnNlcnNbdG9rZW4udHlwZV0gfHwgc2VsZi5fcGFyc2Vyc1snKiddLFxuICAgICAgbWF0Y2ggPSB0b2tlbi5tYXRjaCxcbiAgICAgIHByZXZUb2tlbiA9IHNlbGYucHJldlRva2VuLFxuICAgICAgcHJldlRva2VuVHlwZSA9IHByZXZUb2tlbiA/IHByZXZUb2tlbi50eXBlIDogbnVsbCxcbiAgICAgIGxhc3RTdGF0ZSA9IChzZWxmLnN0YXRlLmxlbmd0aCkgPyBzZWxmLnN0YXRlW3NlbGYuc3RhdGUubGVuZ3RoIC0gMV0gOiBudWxsLFxuICAgICAgdGVtcDtcblxuICAgIGlmIChmbiAmJiB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGlmICghZm4uY2FsbCh0aGlzLCB0b2tlbikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChsYXN0U3RhdGUgJiYgcHJldlRva2VuICYmXG4gICAgICAgIGxhc3RTdGF0ZSA9PT0gX3QuRklMVEVSICYmXG4gICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LkZJTFRFUiAmJlxuICAgICAgICB0b2tlbi50eXBlICE9PSBfdC5QQVJFTkNMT1NFICYmXG4gICAgICAgIHRva2VuLnR5cGUgIT09IF90LkNPTU1BICYmXG4gICAgICAgIHRva2VuLnR5cGUgIT09IF90Lk9QRVJBVE9SICYmXG4gICAgICAgIHRva2VuLnR5cGUgIT09IF90LkZJTFRFUiAmJlxuICAgICAgICB0b2tlbi50eXBlICE9PSBfdC5GSUxURVJFTVBUWSkge1xuICAgICAgc2VsZi5vdXQucHVzaCgnLCAnKTtcbiAgICB9XG5cbiAgICBpZiAobGFzdFN0YXRlICYmIGxhc3RTdGF0ZSA9PT0gX3QuTUVUSE9ET1BFTikge1xuICAgICAgc2VsZi5zdGF0ZS5wb3AoKTtcbiAgICAgIGlmICh0b2tlbi50eXBlICE9PSBfdC5QQVJFTkNMT1NFKSB7XG4gICAgICAgIHNlbGYub3V0LnB1c2goJywgJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc3dpdGNoICh0b2tlbi50eXBlKSB7XG4gICAgY2FzZSBfdC5XSElURVNQQUNFOlxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LlNUUklORzpcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGgpO1xuICAgICAgc2VsZi5vdXQucHVzaChtYXRjaC5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5OVU1CRVI6XG4gICAgY2FzZSBfdC5CT09MOlxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCk7XG4gICAgICBzZWxmLm91dC5wdXNoKG1hdGNoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5GSUxURVI6XG4gICAgICBpZiAoIXNlbGYuZmlsdGVycy5oYXNPd25Qcm9wZXJ0eShtYXRjaCkgfHwgdHlwZW9mIHNlbGYuZmlsdGVyc1ttYXRjaF0gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdJbnZhbGlkIGZpbHRlciBcIicgKyBtYXRjaCArICdcIicsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLmVzY2FwZSA9IHNlbGYuZmlsdGVyc1ttYXRjaF0uc2FmZSA/IGZhbHNlIDogc2VsZi5lc2NhcGU7XG4gICAgICB0ZW1wID0gc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIHNlbGYub3V0LnNwbGljZSh0ZW1wLCAwLCAnX2ZpbHRlcnNbXCInICsgbWF0Y2ggKyAnXCJdKCcpO1xuICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHRlbXApO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkZJTFRFUkVNUFRZOlxuICAgICAgaWYgKCFzZWxmLmZpbHRlcnMuaGFzT3duUHJvcGVydHkobWF0Y2gpIHx8IHR5cGVvZiBzZWxmLmZpbHRlcnNbbWF0Y2hdICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignSW52YWxpZCBmaWx0ZXIgXCInICsgbWF0Y2ggKyAnXCInLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5lc2NhcGUgPSBzZWxmLmZpbHRlcnNbbWF0Y2hdLnNhZmUgPyBmYWxzZSA6IHNlbGYuZXNjYXBlO1xuICAgICAgc2VsZi5vdXQuc3BsaWNlKHNlbGYuZmlsdGVyQXBwbHlJZHhbc2VsZi5maWx0ZXJBcHBseUlkeC5sZW5ndGggLSAxXSwgMCwgJ19maWx0ZXJzW1wiJyArIG1hdGNoICsgJ1wiXSgnKTtcbiAgICAgIHNlbGYub3V0LnB1c2goJyknKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5GVU5DVElPTjpcbiAgICBjYXNlIF90LkZVTkNUSU9ORU1QVFk6XG4gICAgICBzZWxmLm91dC5wdXNoKCcoKHR5cGVvZiBfY3R4LicgKyBtYXRjaCArICcgIT09IFwidW5kZWZpbmVkXCIpID8gX2N0eC4nICsgbWF0Y2ggK1xuICAgICAgICAnIDogKCh0eXBlb2YgJyArIG1hdGNoICsgJyAhPT0gXCJ1bmRlZmluZWRcIikgPyAnICsgbWF0Y2ggK1xuICAgICAgICAnIDogX2ZuKSkoJyk7XG4gICAgICBzZWxmLmVzY2FwZSA9IGZhbHNlO1xuICAgICAgaWYgKHRva2VuLnR5cGUgPT09IF90LkZVTkNUSU9ORU1QVFkpIHtcbiAgICAgICAgc2VsZi5vdXRbc2VsZi5vdXQubGVuZ3RoIC0gMV0gPSBzZWxmLm91dFtzZWxmLm91dC5sZW5ndGggLSAxXSArICcpJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc3RhdGUucHVzaCh0b2tlbi50eXBlKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGggLSAxKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5QQVJFTk9QRU46XG4gICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICBpZiAoc2VsZi5maWx0ZXJBcHBseUlkeC5sZW5ndGgpIHtcbiAgICAgICAgc2VsZi5vdXQuc3BsaWNlKHNlbGYuZmlsdGVyQXBwbHlJZHhbc2VsZi5maWx0ZXJBcHBseUlkeC5sZW5ndGggLSAxXSwgMCwgJygnKTtcbiAgICAgICAgaWYgKHByZXZUb2tlbiAmJiBwcmV2VG9rZW5UeXBlID09PSBfdC5WQVIpIHtcbiAgICAgICAgICB0ZW1wID0gcHJldlRva2VuLm1hdGNoLnNwbGl0KCcuJykuc2xpY2UoMCwgLTEpO1xuICAgICAgICAgIHNlbGYub3V0LnB1c2goJyB8fCBfZm4pLmNhbGwoJyArIHNlbGYuY2hlY2tNYXRjaCh0ZW1wKSk7XG4gICAgICAgICAgc2VsZi5zdGF0ZS5wdXNoKF90Lk1FVEhPRE9QRU4pO1xuICAgICAgICAgIHNlbGYuZXNjYXBlID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2VsZi5vdXQucHVzaCgnIHx8IF9mbikoJyk7XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCAtIDMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5vdXQucHVzaCgnKCcpO1xuICAgICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoIC0gMSk7XG4gICAgICB9XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuUEFSRU5DTE9TRTpcbiAgICAgIHRlbXAgPSBzZWxmLnN0YXRlLnBvcCgpO1xuICAgICAgaWYgKHRlbXAgIT09IF90LlBBUkVOT1BFTiAmJiB0ZW1wICE9PSBfdC5GVU5DVElPTiAmJiB0ZW1wICE9PSBfdC5GSUxURVIpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignTWlzbWF0Y2hlZCBuZXN0aW5nIHN0YXRlJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJyknKTtcbiAgICAgIC8vIE9uY2Ugb2ZmIHRoZSBwcmV2aW91cyBlbnRyeVxuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIC8vIE9uY2UgZm9yIHRoZSBvcGVuIHBhcmVuXG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkNPTU1BOlxuICAgICAgaWYgKGxhc3RTdGF0ZSAhPT0gX3QuRlVOQ1RJT04gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IF90LkZJTFRFUiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gX3QuQVJSQVlPUEVOICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSBfdC5DVVJMWU9QRU4gJiZcbiAgICAgICAgICBsYXN0U3RhdGUgIT09IF90LlBBUkVOT1BFTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gX3QuQ09MT04pIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBjb21tYScsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBpZiAobGFzdFN0YXRlID09PSBfdC5DT0xPTikge1xuICAgICAgICBzZWxmLnN0YXRlLnBvcCgpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnLCAnKTtcbiAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuTE9HSUM6XG4gICAgY2FzZSBfdC5DT01QQVJBVE9SOlxuICAgICAgaWYgKCFwcmV2VG9rZW4gfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5DT01NQSB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IHRva2VuLnR5cGUgfHxcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlID09PSBfdC5CUkFDS0VUT1BFTiB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LkNVUkxZT1BFTiB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LlBBUkVOT1BFTiB8fFxuICAgICAgICAgIHByZXZUb2tlblR5cGUgPT09IF90LkZVTkNUSU9OKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgbG9naWMnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuTk9UOlxuICAgICAgc2VsZi5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuVkFSOlxuICAgICAgc2VsZi5wYXJzZVZhcih0b2tlbiwgbWF0Y2gsIGxhc3RTdGF0ZSk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQlJBQ0tFVE9QRU46XG4gICAgICBpZiAoIXByZXZUb2tlbiB8fFxuICAgICAgICAgIChwcmV2VG9rZW5UeXBlICE9PSBfdC5WQVIgJiZcbiAgICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkJSQUNLRVRDTE9TRSAmJlxuICAgICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuUEFSRU5DTE9TRSkpIHtcbiAgICAgICAgc2VsZi5zdGF0ZS5wdXNoKF90LkFSUkFZT1BFTik7XG4gICAgICAgIHNlbGYuZmlsdGVyQXBwbHlJZHgucHVzaChzZWxmLm91dC5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnWycpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkJSQUNLRVRDTE9TRTpcbiAgICAgIHRlbXAgPSBzZWxmLnN0YXRlLnBvcCgpO1xuICAgICAgaWYgKHRlbXAgIT09IF90LkJSQUNLRVRPUEVOICYmIHRlbXAgIT09IF90LkFSUkFZT1BFTikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGNsb3Npbmcgc3F1YXJlIGJyYWNrZXQnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnXScpO1xuICAgICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wb3AoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSBfdC5DVVJMWU9QRU46XG4gICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICBzZWxmLm91dC5wdXNoKCd7Jyk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnB1c2goc2VsZi5vdXQubGVuZ3RoIC0gMSk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgX3QuQ09MT046XG4gICAgICBpZiAobGFzdFN0YXRlICE9PSBfdC5DVVJMWU9QRU4pIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBjb2xvbicsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLnN0YXRlLnB1c2godG9rZW4udHlwZSk7XG4gICAgICBzZWxmLm91dC5wdXNoKCc6Jyk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkNVUkxZQ0xPU0U6XG4gICAgICBpZiAobGFzdFN0YXRlID09PSBfdC5DT0xPTikge1xuICAgICAgICBzZWxmLnN0YXRlLnBvcCgpO1xuICAgICAgfVxuICAgICAgaWYgKHNlbGYuc3RhdGUucG9wKCkgIT09IF90LkNVUkxZT1BFTikge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGNsb3NpbmcgY3VybHkgYnJhY2UnLCBzZWxmLmxpbmUsIHNlbGYuZmlsZW5hbWUpO1xuICAgICAgfVxuICAgICAgc2VsZi5vdXQucHVzaCgnfScpO1xuXG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90LkRPVEtFWTpcbiAgICAgIGlmICghcHJldlRva2VuIHx8IChcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5WQVIgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5CUkFDS0VUQ0xPU0UgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5ET1RLRVkgJiZcbiAgICAgICAgICBwcmV2VG9rZW5UeXBlICE9PSBfdC5QQVJFTkNMT1NFICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuRlVOQ1RJT05FTVBUWSAmJlxuICAgICAgICAgIHByZXZUb2tlblR5cGUgIT09IF90LkZJTFRFUkVNUFRZICYmXG4gICAgICAgICAgcHJldlRva2VuVHlwZSAhPT0gX3QuQ1VSTFlDTE9TRVxuICAgICAgICApKSB7XG4gICAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQga2V5IFwiJyArIG1hdGNoICsgJ1wiJywgc2VsZi5saW5lLCBzZWxmLmZpbGVuYW1lKTtcbiAgICAgIH1cbiAgICAgIHNlbGYub3V0LnB1c2goJy4nICsgbWF0Y2gpO1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlIF90Lk9QRVJBVE9SOlxuICAgICAgc2VsZi5vdXQucHVzaCgnICcgKyBtYXRjaCArICcgJyk7XG4gICAgICBzZWxmLmZpbHRlckFwcGx5SWR4LnBvcCgpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBQYXJzZSB2YXJpYWJsZSB0b2tlblxuICAgKiBAcGFyYW0gIHt7bWF0Y2g6IHN0cmluZywgdHlwZTogbnVtYmVyLCBsaW5lOiBudW1iZXJ9fSB0b2tlbiAgICAgIExleGVyIHRva2VuIG9iamVjdC5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBtYXRjaCAgICAgICBTaG9ydGN1dCBmb3IgdG9rZW4ubWF0Y2hcbiAgICogQHBhcmFtICB7bnVtYmVyfSBsYXN0U3RhdGUgICBMZXhlciB0b2tlbiB0eXBlIHN0YXRlLlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwYXJzZVZhcjogZnVuY3Rpb24gKHRva2VuLCBtYXRjaCwgbGFzdFN0YXRlKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgbWF0Y2ggPSBtYXRjaC5zcGxpdCgnLicpO1xuXG4gICAgaWYgKF9yZXNlcnZlZC5pbmRleE9mKG1hdGNoWzBdKSAhPT0gLTEpIHtcbiAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1Jlc2VydmVkIGtleXdvcmQgXCInICsgbWF0Y2hbMF0gKyAnXCIgYXR0ZW1wdGVkIHRvIGJlIHVzZWQgYXMgYSB2YXJpYWJsZScsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgfVxuXG4gICAgc2VsZi5maWx0ZXJBcHBseUlkeC5wdXNoKHNlbGYub3V0Lmxlbmd0aCk7XG4gICAgaWYgKGxhc3RTdGF0ZSA9PT0gX3QuQ1VSTFlPUEVOKSB7XG4gICAgICBpZiAobWF0Y2gubGVuZ3RoID4gMSkge1xuICAgICAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIGRvdCcsIHNlbGYubGluZSwgc2VsZi5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgICBzZWxmLm91dC5wdXNoKG1hdGNoWzBdKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzZWxmLm91dC5wdXNoKHNlbGYuY2hlY2tNYXRjaChtYXRjaCkpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZXR1cm4gY29udGV4dHVhbCBkb3QtY2hlY2sgc3RyaW5nIGZvciBhIG1hdGNoXG4gICAqIEBwYXJhbSAge3N0cmluZ30gbWF0Y2ggICAgICAgU2hvcnRjdXQgZm9yIHRva2VuLm1hdGNoXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBjaGVja01hdGNoOiBmdW5jdGlvbiAobWF0Y2gpIHtcbiAgICB2YXIgdGVtcCA9IG1hdGNoWzBdO1xuXG4gICAgZnVuY3Rpb24gY2hlY2tEb3QoY3R4KSB7XG4gICAgICB2YXIgYyA9IGN0eCArIHRlbXAsXG4gICAgICAgIG0gPSBtYXRjaCxcbiAgICAgICAgYnVpbGQgPSAnJztcblxuICAgICAgYnVpbGQgPSAnKHR5cGVvZiAnICsgYyArICcgIT09IFwidW5kZWZpbmVkXCInO1xuICAgICAgdXRpbHMuZWFjaChtLCBmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBidWlsZCArPSAnICYmICcgKyBjICsgJy4nICsgdiArICcgIT09IHVuZGVmaW5lZCc7XG4gICAgICAgIGMgKz0gJy4nICsgdjtcbiAgICAgIH0pO1xuICAgICAgYnVpbGQgKz0gJyknO1xuXG4gICAgICByZXR1cm4gYnVpbGQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGREb3QoY3R4KSB7XG4gICAgICByZXR1cm4gJygnICsgY2hlY2tEb3QoY3R4KSArICcgPyAnICsgY3R4ICsgbWF0Y2guam9pbignLicpICsgJyA6IFwiXCIpJztcbiAgICB9XG5cbiAgICByZXR1cm4gJygnICsgY2hlY2tEb3QoJ19jdHguJykgKyAnID8gJyArIGJ1aWxkRG90KCdfY3R4LicpICsgJyA6ICcgKyBidWlsZERvdCgnJykgKyAnKSc7XG4gIH1cbn07XG5cbi8qKlxuICogUGFyc2UgYSBzb3VyY2Ugc3RyaW5nIGludG8gdG9rZW5zIHRoYXQgYXJlIHJlYWR5IGZvciBjb21waWxhdGlvbi5cbiAqXG4gKiBAZXhhbXBsZVxuICogZXhwb3J0cy5wYXJzZSgne3sgdGFjb3MgfX0nLCB7fSwgdGFncywgZmlsdGVycyk7XG4gKiAvLyA9PiBbeyBjb21waWxlOiBbRnVuY3Rpb25dLCAuLi4gfV1cbiAqXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHNvdXJjZSAgU3dpZyB0ZW1wbGF0ZSBzb3VyY2UuXG4gKiBAcGFyYW0gIHtvYmplY3R9IG9wdHMgICAgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSAge29iamVjdH0gdGFncyAgICBLZXllZCBvYmplY3Qgb2YgdGFncyB0aGF0IGNhbiBiZSBwYXJzZWQgYW5kIGNvbXBpbGVkLlxuICogQHBhcmFtICB7b2JqZWN0fSBmaWx0ZXJzIEtleWVkIG9iamVjdCBvZiBmaWx0ZXJzIHRoYXQgbWF5IGJlIGFwcGxpZWQgdG8gdmFyaWFibGVzLlxuICogQHJldHVybiB7YXJyYXl9ICAgICAgICAgIExpc3Qgb2YgdG9rZW5zIHJlYWR5IGZvciBjb21waWxhdGlvbi5cbiAqL1xuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzb3VyY2UsIG9wdHMsIHRhZ3MsIGZpbHRlcnMpIHtcbiAgc291cmNlID0gc291cmNlLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG4gIHZhciBlc2NhcGUgPSBvcHRzLmF1dG9lc2NhcGUsXG4gICAgdGFnT3BlbiA9IG9wdHMudGFnQ29udHJvbHNbMF0sXG4gICAgdGFnQ2xvc2UgPSBvcHRzLnRhZ0NvbnRyb2xzWzFdLFxuICAgIHZhck9wZW4gPSBvcHRzLnZhckNvbnRyb2xzWzBdLFxuICAgIHZhckNsb3NlID0gb3B0cy52YXJDb250cm9sc1sxXSxcbiAgICBlc2NhcGVkVGFnT3BlbiA9IGVzY2FwZVJlZ0V4cCh0YWdPcGVuKSxcbiAgICBlc2NhcGVkVGFnQ2xvc2UgPSBlc2NhcGVSZWdFeHAodGFnQ2xvc2UpLFxuICAgIGVzY2FwZWRWYXJPcGVuID0gZXNjYXBlUmVnRXhwKHZhck9wZW4pLFxuICAgIGVzY2FwZWRWYXJDbG9zZSA9IGVzY2FwZVJlZ0V4cCh2YXJDbG9zZSksXG4gICAgdGFnU3RyaXAgPSBuZXcgUmVnRXhwKCdeJyArIGVzY2FwZWRUYWdPcGVuICsgJy0/XFxcXHMqLT98LT9cXFxccyotPycgKyBlc2NhcGVkVGFnQ2xvc2UgKyAnJCcsICdnJyksXG4gICAgdGFnU3RyaXBCZWZvcmUgPSBuZXcgUmVnRXhwKCdeJyArIGVzY2FwZWRUYWdPcGVuICsgJy0nKSxcbiAgICB0YWdTdHJpcEFmdGVyID0gbmV3IFJlZ0V4cCgnLScgKyBlc2NhcGVkVGFnQ2xvc2UgKyAnJCcpLFxuICAgIHZhclN0cmlwID0gbmV3IFJlZ0V4cCgnXicgKyBlc2NhcGVkVmFyT3BlbiArICctP1xcXFxzKi0/fC0/XFxcXHMqLT8nICsgZXNjYXBlZFZhckNsb3NlICsgJyQnLCAnZycpLFxuICAgIHZhclN0cmlwQmVmb3JlID0gbmV3IFJlZ0V4cCgnXicgKyBlc2NhcGVkVmFyT3BlbiArICctJyksXG4gICAgdmFyU3RyaXBBZnRlciA9IG5ldyBSZWdFeHAoJy0nICsgZXNjYXBlZFZhckNsb3NlICsgJyQnKSxcbiAgICBjbXRPcGVuID0gb3B0cy5jbXRDb250cm9sc1swXSxcbiAgICBjbXRDbG9zZSA9IG9wdHMuY210Q29udHJvbHNbMV0sXG4gICAgYW55Q2hhciA9ICdbXFxcXHNcXFxcU10qPycsXG4gICAgLy8gU3BsaXQgdGhlIHRlbXBsYXRlIHNvdXJjZSBiYXNlZCBvbiB2YXJpYWJsZSwgdGFnLCBhbmQgY29tbWVudCBibG9ja3NcbiAgICAvLyAvKFxceyVbXFxzXFxTXSo/JVxcfXxcXHtcXHtbXFxzXFxTXSo/XFx9XFx9fFxceyNbXFxzXFxTXSo/I1xcfSkvXG4gICAgc3BsaXR0ZXIgPSBuZXcgUmVnRXhwKFxuICAgICAgJygnICtcbiAgICAgICAgZXNjYXBlZFRhZ09wZW4gKyBhbnlDaGFyICsgZXNjYXBlZFRhZ0Nsb3NlICsgJ3wnICtcbiAgICAgICAgZXNjYXBlZFZhck9wZW4gKyBhbnlDaGFyICsgZXNjYXBlZFZhckNsb3NlICsgJ3wnICtcbiAgICAgICAgZXNjYXBlUmVnRXhwKGNtdE9wZW4pICsgYW55Q2hhciArIGVzY2FwZVJlZ0V4cChjbXRDbG9zZSkgK1xuICAgICAgICAnKSdcbiAgICApLFxuICAgIGxpbmUgPSAxLFxuICAgIHN0YWNrID0gW10sXG4gICAgcGFyZW50ID0gbnVsbCxcbiAgICB0b2tlbnMgPSBbXSxcbiAgICBibG9ja3MgPSB7fSxcbiAgICBpblJhdyA9IGZhbHNlLFxuICAgIHN0cmlwTmV4dDtcblxuICAvKipcbiAgICogUGFyc2UgYSB2YXJpYWJsZS5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBzdHIgIFN0cmluZyBjb250ZW50cyBvZiB0aGUgdmFyaWFibGUsIGJldHdlZW4gPGk+e3s8L2k+IGFuZCA8aT59fTwvaT5cbiAgICogQHBhcmFtICB7bnVtYmVyfSBsaW5lIFRoZSBsaW5lIG51bWJlciB0aGF0IHRoaXMgdmFyaWFibGUgc3RhcnRzIG9uLlxuICAgKiBAcmV0dXJuIHtWYXJUb2tlbn0gICAgICBQYXJzZWQgdmFyaWFibGUgdG9rZW4gb2JqZWN0LlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gcGFyc2VWYXJpYWJsZShzdHIsIGxpbmUpIHtcbiAgICB2YXIgdG9rZW5zID0gbGV4ZXIucmVhZCh1dGlscy5zdHJpcChzdHIpKSxcbiAgICAgIHBhcnNlcixcbiAgICAgIG91dDtcblxuICAgIHBhcnNlciA9IG5ldyBUb2tlblBhcnNlcih0b2tlbnMsIGZpbHRlcnMsIGVzY2FwZSwgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgb3V0ID0gcGFyc2VyLnBhcnNlKCkuam9pbignJyk7XG5cbiAgICBpZiAocGFyc2VyLnN0YXRlLmxlbmd0aCkge1xuICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5hYmxlIHRvIHBhcnNlIFwiJyArIHN0ciArICdcIicsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcGFyc2VkIHZhcmlhYmxlIHRva2VuLlxuICAgICAqIEB0eXBlZGVmIHtvYmplY3R9IFZhclRva2VuXG4gICAgICogQHByb3BlcnR5IHtmdW5jdGlvbn0gY29tcGlsZSBNZXRob2QgZm9yIGNvbXBpbGluZyB0aGlzIHRva2VuLlxuICAgICAqL1xuICAgIHJldHVybiB7XG4gICAgICBjb21waWxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAnX291dHB1dCArPSAnICsgb3V0ICsgJztcXG4nO1xuICAgICAgfVxuICAgIH07XG4gIH1cbiAgZXhwb3J0cy5wYXJzZVZhcmlhYmxlID0gcGFyc2VWYXJpYWJsZTtcblxuICAvKipcbiAgICogUGFyc2UgYSB0YWcuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc3RyICBTdHJpbmcgY29udGVudHMgb2YgdGhlIHRhZywgYmV0d2VlbiA8aT57JTwvaT4gYW5kIDxpPiV9PC9pPlxuICAgKiBAcGFyYW0gIHtudW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyIHRoYXQgdGhpcyB0YWcgc3RhcnRzIG9uLlxuICAgKiBAcmV0dXJuIHtUYWdUb2tlbn0gICAgICBQYXJzZWQgdG9rZW4gb2JqZWN0LlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gcGFyc2VUYWcoc3RyLCBsaW5lKSB7XG4gICAgdmFyIHRva2VucywgcGFyc2VyLCBjaHVua3MsIHRhZ05hbWUsIHRhZywgYXJncywgbGFzdDtcblxuICAgIGlmICh1dGlscy5zdGFydHNXaXRoKHN0ciwgJ2VuZCcpKSB7XG4gICAgICBsYXN0ID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG4gICAgICBpZiAobGFzdCAmJiBsYXN0Lm5hbWUgPT09IHN0ci5zcGxpdCgvXFxzKy8pWzBdLnJlcGxhY2UoL15lbmQvLCAnJykgJiYgbGFzdC5lbmRzKSB7XG4gICAgICAgIHN3aXRjaCAobGFzdC5uYW1lKSB7XG4gICAgICAgIGNhc2UgJ2F1dG9lc2NhcGUnOlxuICAgICAgICAgIGVzY2FwZSA9IG9wdHMuYXV0b2VzY2FwZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncmF3JzpcbiAgICAgICAgICBpblJhdyA9IGZhbHNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghaW5SYXcpIHtcbiAgICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCBlbmQgb2YgdGFnIFwiJyArIHN0ci5yZXBsYWNlKC9eZW5kLywgJycpICsgJ1wiJywgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGluUmF3KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2h1bmtzID0gc3RyLnNwbGl0KC9cXHMrKC4rKT8vKTtcbiAgICB0YWdOYW1lID0gY2h1bmtzLnNoaWZ0KCk7XG5cbiAgICBpZiAoIXRhZ3MuaGFzT3duUHJvcGVydHkodGFnTmFtZSkpIHtcbiAgICAgIHV0aWxzLnRocm93RXJyb3IoJ1VuZXhwZWN0ZWQgdGFnIFwiJyArIHN0ciArICdcIicsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgIH1cblxuICAgIHRva2VucyA9IGxleGVyLnJlYWQodXRpbHMuc3RyaXAoY2h1bmtzLmpvaW4oJyAnKSkpO1xuICAgIHBhcnNlciA9IG5ldyBUb2tlblBhcnNlcih0b2tlbnMsIGZpbHRlcnMsIGZhbHNlLCBsaW5lLCBvcHRzLmZpbGVuYW1lKTtcbiAgICB0YWcgPSB0YWdzW3RhZ05hbWVdO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lIGN1c3RvbSBwYXJzaW5nIG1ldGhvZHMgZm9yIHlvdXIgdGFnLlxuICAgICAqIEBjYWxsYmFjayBwYXJzZVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBleHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgb3B0aW9ucykge1xuICAgICAqICAgcGFyc2VyLm9uKCdzdGFydCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgKiAgICAgLy8gLi4uXG4gICAgICogICB9KTtcbiAgICAgKiAgIHBhcnNlci5vbih0eXBlcy5TVFJJTkcsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAqICAgICAvLyAuLi5cbiAgICAgKiAgIH0pO1xuICAgICAqIH07XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyIFRoZSBmdWxsIHRva2VuIHN0cmluZyBvZiB0aGUgdGFnLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW5lIFRoZSBsaW5lIG51bWJlciB0aGF0IHRoaXMgdGFnIGFwcGVhcnMgb24uXG4gICAgICogQHBhcmFtIHtUb2tlblBhcnNlcn0gcGFyc2VyIEEgVG9rZW5QYXJzZXIgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHtUWVBFU30gdHlwZXMgTGV4ZXIgdG9rZW4gdHlwZSBlbnVtLlxuICAgICAqIEBwYXJhbSB7VGFnVG9rZW5bXX0gc3RhY2sgVGhlIGN1cnJlbnQgc3RhY2sgb2Ygb3BlbiB0YWdzLlxuICAgICAqIEBwYXJhbSB7U3dpZ09wdHN9IG9wdGlvbnMgU3dpZyBPcHRpb25zIE9iamVjdC5cbiAgICAgKi9cbiAgICBpZiAoIXRhZy5wYXJzZShjaHVua3NbMV0sIGxpbmUsIHBhcnNlciwgX3QsIHN0YWNrLCBvcHRzKSkge1xuICAgICAgdXRpbHMudGhyb3dFcnJvcignVW5leHBlY3RlZCB0YWcgXCInICsgdGFnTmFtZSArICdcIicsIGxpbmUsIG9wdHMuZmlsZW5hbWUpO1xuICAgIH1cblxuICAgIHBhcnNlci5wYXJzZSgpO1xuICAgIGFyZ3MgPSBwYXJzZXIub3V0O1xuXG4gICAgc3dpdGNoICh0YWdOYW1lKSB7XG4gICAgY2FzZSAnYXV0b2VzY2FwZSc6XG4gICAgICBlc2NhcGUgPSAoYXJnc1swXSAhPT0gJ2ZhbHNlJykgPyBhcmdzWzBdIDogZmFsc2U7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdyYXcnOlxuICAgICAgaW5SYXcgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSBwYXJzZWQgdGFnIHRva2VuLlxuICAgICAqIEB0eXBlZGVmIHtPYmplY3R9IFRhZ1Rva2VuXG4gICAgICogQHByb3BlcnR5IHtjb21waWxlfSBbY29tcGlsZV0gTWV0aG9kIGZvciBjb21waWxpbmcgdGhpcyB0b2tlbi5cbiAgICAgKiBAcHJvcGVydHkge2FycmF5fSBbYXJnc10gQXJyYXkgb2YgYXJndW1lbnRzIGZvciB0aGUgdGFnLlxuICAgICAqIEBwcm9wZXJ0eSB7VG9rZW5bXX0gW2NvbnRlbnQ9W11dIEFuIGFycmF5IG9mIHRva2VucyB0aGF0IGFyZSBjaGlsZHJlbiBvZiB0aGlzIFRva2VuLlxuICAgICAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gW2VuZHNdIFdoZXRoZXIgb3Igbm90IHRoaXMgdGFnIHJlcXVpcmVzIGFuIGVuZCB0YWcuXG4gICAgICogQHByb3BlcnR5IHtzdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhpcyB0YWcuXG4gICAgICovXG4gICAgcmV0dXJuIHtcbiAgICAgIGJsb2NrOiAhIXRhZ3NbdGFnTmFtZV0uYmxvY2ssXG4gICAgICBjb21waWxlOiB0YWcuY29tcGlsZSxcbiAgICAgIGFyZ3M6IGFyZ3MsXG4gICAgICBjb250ZW50OiBbXSxcbiAgICAgIGVuZHM6IHRhZy5lbmRzLFxuICAgICAgbmFtZTogdGFnTmFtZVxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogU3RyaXAgdGhlIHdoaXRlc3BhY2UgZnJvbSB0aGUgcHJldmlvdXMgdG9rZW4sIGlmIGl0IGlzIGEgc3RyaW5nLlxuICAgKiBAcGFyYW0gIHtvYmplY3R9IHRva2VuIFBhcnNlZCB0b2tlbi5cbiAgICogQHJldHVybiB7b2JqZWN0fSAgICAgICBJZiB0aGUgdG9rZW4gd2FzIGEgc3RyaW5nLCB0cmFpbGluZyB3aGl0ZXNwYWNlIHdpbGwgYmUgc3RyaXBwZWQuXG4gICAqL1xuICBmdW5jdGlvbiBzdHJpcFByZXZUb2tlbih0b2tlbikge1xuICAgIGlmICh0eXBlb2YgdG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICB0b2tlbiA9IHRva2VuLnJlcGxhY2UoL1xccyokLywgJycpO1xuICAgIH1cbiAgICByZXR1cm4gdG9rZW47XG4gIH1cblxuICAvKiFcbiAgICogTG9vcCBvdmVyIHRoZSBzb3VyY2UsIHNwbGl0IHZpYSB0aGUgdGFnL3Zhci9jb21tZW50IHJlZ3VsYXIgZXhwcmVzc2lvbiBzcGxpdHRlci5cbiAgICogU2VuZCBlYWNoIGNodW5rIHRvIHRoZSBhcHByb3ByaWF0ZSBwYXJzZXIuXG4gICAqL1xuICB1dGlscy5lYWNoKHNvdXJjZS5zcGxpdChzcGxpdHRlciksIGZ1bmN0aW9uIChjaHVuaykge1xuICAgIHZhciB0b2tlbiwgbGluZXMsIHN0cmlwUHJldiwgcHJldlRva2VuLCBwcmV2Q2hpbGRUb2tlbjtcblxuICAgIGlmICghY2h1bmspIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJcyBhIHZhcmlhYmxlP1xuICAgIGlmICghaW5SYXcgJiYgdXRpbHMuc3RhcnRzV2l0aChjaHVuaywgdmFyT3BlbikgJiYgdXRpbHMuZW5kc1dpdGgoY2h1bmssIHZhckNsb3NlKSkge1xuICAgICAgc3RyaXBQcmV2ID0gdmFyU3RyaXBCZWZvcmUudGVzdChjaHVuayk7XG4gICAgICBzdHJpcE5leHQgPSB2YXJTdHJpcEFmdGVyLnRlc3QoY2h1bmspO1xuICAgICAgdG9rZW4gPSBwYXJzZVZhcmlhYmxlKGNodW5rLnJlcGxhY2UodmFyU3RyaXAsICcnKSwgbGluZSk7XG4gICAgLy8gSXMgYSB0YWc/XG4gICAgfSBlbHNlIGlmICh1dGlscy5zdGFydHNXaXRoKGNodW5rLCB0YWdPcGVuKSAmJiB1dGlscy5lbmRzV2l0aChjaHVuaywgdGFnQ2xvc2UpKSB7XG4gICAgICBzdHJpcFByZXYgPSB0YWdTdHJpcEJlZm9yZS50ZXN0KGNodW5rKTtcbiAgICAgIHN0cmlwTmV4dCA9IHRhZ1N0cmlwQWZ0ZXIudGVzdChjaHVuayk7XG4gICAgICB0b2tlbiA9IHBhcnNlVGFnKGNodW5rLnJlcGxhY2UodGFnU3RyaXAsICcnKSwgbGluZSk7XG4gICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgaWYgKHRva2VuLm5hbWUgPT09ICdleHRlbmRzJykge1xuICAgICAgICAgIHBhcmVudCA9IHRva2VuLmFyZ3Muam9pbignJykucmVwbGFjZSgvXlxcJ3xcXCckL2csICcnKS5yZXBsYWNlKC9eXFxcInxcXFwiJC9nLCAnJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodG9rZW4uYmxvY2sgJiYgKCFzdGFjay5sZW5ndGggfHwgdG9rZW4ubmFtZSA9PT0gJ2Jsb2NrJykpIHtcbiAgICAgICAgICBibG9ja3NbdG9rZW4uYXJncy5qb2luKCcnKV0gPSB0b2tlbjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGluUmF3ICYmICF0b2tlbikge1xuICAgICAgICB0b2tlbiA9IGNodW5rO1xuICAgICAgfVxuICAgIC8vIElzIGEgY29udGVudCBzdHJpbmc/XG4gICAgfSBlbHNlIGlmIChpblJhdyB8fCAoIXV0aWxzLnN0YXJ0c1dpdGgoY2h1bmssIGNtdE9wZW4pICYmICF1dGlscy5lbmRzV2l0aChjaHVuaywgY210Q2xvc2UpKSkge1xuICAgICAgdG9rZW4gPSAoc3RyaXBOZXh0KSA/IGNodW5rLnJlcGxhY2UoL15cXHMqLywgJycpIDogY2h1bms7XG4gICAgICBzdHJpcE5leHQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKHV0aWxzLnN0YXJ0c1dpdGgoY2h1bmssIGNtdE9wZW4pICYmIHV0aWxzLmVuZHNXaXRoKGNodW5rLCBjbXRDbG9zZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEaWQgdGhpcyB0YWcgYXNrIHRvIHN0cmlwIHByZXZpb3VzIHdoaXRlc3BhY2U/IDxjb2RlPnslLSAuLi4gJX08L2NvZGU+IG9yIDxjb2RlPnt7LSAuLi4gfX08L2NvZGU+XG4gICAgaWYgKHN0cmlwUHJldiAmJiB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICBwcmV2VG9rZW4gPSB0b2tlbnMucG9wKCk7XG4gICAgICBpZiAodHlwZW9mIHByZXZUb2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcHJldlRva2VuID0gc3RyaXBQcmV2VG9rZW4ocHJldlRva2VuKTtcbiAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLmNvbnRlbnQgJiYgcHJldlRva2VuLmNvbnRlbnQubGVuZ3RoKSB7XG4gICAgICAgIHByZXZDaGlsZFRva2VuID0gc3RyaXBQcmV2VG9rZW4ocHJldlRva2VuLmNvbnRlbnQucG9wKCkpO1xuICAgICAgICBwcmV2VG9rZW4uY29udGVudC5wdXNoKHByZXZDaGlsZFRva2VuKTtcbiAgICAgIH1cbiAgICAgIHRva2Vucy5wdXNoKHByZXZUb2tlbik7XG4gICAgfVxuXG4gICAgLy8gVGhpcyB3YXMgYSBjb21tZW50LCBzbyBsZXQncyBqdXN0IGtlZXAgZ29pbmcuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElmIHRoZXJlJ3MgYW4gb3BlbiBpdGVtIGluIHRoZSBzdGFjaywgYWRkIHRoaXMgdG8gaXRzIGNvbnRlbnQuXG4gICAgaWYgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0uY29udGVudC5wdXNoKHRva2VuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdG9rZW5zLnB1c2godG9rZW4pO1xuICAgIH1cblxuICAgIC8vIElmIHRoZSB0b2tlbiBpcyBhIHRhZyB0aGF0IHJlcXVpcmVzIGFuIGVuZCB0YWcsIG9wZW4gaXQgb24gdGhlIHN0YWNrLlxuICAgIGlmICh0b2tlbi5uYW1lICYmIHRva2VuLmVuZHMpIHtcbiAgICAgIHN0YWNrLnB1c2godG9rZW4pO1xuICAgIH1cblxuICAgIGxpbmVzID0gY2h1bmsubWF0Y2goL1xcbi9nKTtcbiAgICBsaW5lICs9IChsaW5lcykgPyBsaW5lcy5sZW5ndGggOiAwO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6IG9wdHMuZmlsZW5hbWUsXG4gICAgcGFyZW50OiBwYXJlbnQsXG4gICAgdG9rZW5zOiB0b2tlbnMsXG4gICAgYmxvY2tzOiBibG9ja3NcbiAgfTtcbn07XG5cblxuLyoqXG4gKiBDb21waWxlIGFuIGFycmF5IG9mIHRva2Vucy5cbiAqIEBwYXJhbSAge1Rva2VuW119IHRlbXBsYXRlICAgICBBbiBhcnJheSBvZiB0ZW1wbGF0ZSB0b2tlbnMuXG4gKiBAcGFyYW0gIHtUZW1wbGF0ZXNbXX0gcGFyZW50cyAgQXJyYXkgb2YgcGFyZW50IHRlbXBsYXRlcy5cbiAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9uc10gICBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtICB7c3RyaW5nfSBbYmxvY2tOYW1lXSAgIE5hbWUgb2YgdGhlIGN1cnJlbnQgYmxvY2sgY29udGV4dC5cbiAqIEByZXR1cm4ge3N0cmluZ30gICAgICAgICAgICAgICBQYXJ0aWFsIGZvciBhIGNvbXBpbGVkIEphdmFTY3JpcHQgbWV0aG9kIHRoYXQgd2lsbCBvdXRwdXQgYSByZW5kZXJlZCB0ZW1wbGF0ZS5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKHRlbXBsYXRlLCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgdmFyIG91dCA9ICcnLFxuICAgIHRva2VucyA9IHV0aWxzLmlzQXJyYXkodGVtcGxhdGUpID8gdGVtcGxhdGUgOiB0ZW1wbGF0ZS50b2tlbnM7XG5cbiAgdXRpbHMuZWFjaCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciBvO1xuICAgIGlmICh0eXBlb2YgdG9rZW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvdXQgKz0gJ19vdXRwdXQgKz0gXCInICsgdG9rZW4ucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cXG58XFxyL2csICdcXFxcbicpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKSArICdcIjtcXG4nO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbXBpbGUgY2FsbGJhY2sgZm9yIFZhclRva2VuIGFuZCBUYWdUb2tlbiBvYmplY3RzLlxuICAgICAqIEBjYWxsYmFjayBjb21waWxlXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gICAgICogICBpZiAoYXJnc1swXSA9PT0gJ2ZvbycpIHtcbiAgICAgKiAgICAgcmV0dXJuIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkgKyAnXFxuJztcbiAgICAgKiAgIH1cbiAgICAgKiAgIHJldHVybiAnX291dHB1dCArPSBcImZhbGxiYWNrXCI7XFxuJztcbiAgICAgKiB9O1xuICAgICAqXG4gICAgICogQHBhcmFtIHtwYXJzZXJDb21waWxlcn0gY29tcGlsZXJcbiAgICAgKiBAcGFyYW0ge2FycmF5fSBbYXJnc10gQXJyYXkgb2YgcGFyc2VkIGFyZ3VtZW50cyBvbiB0aGUgZm9yIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2FycmF5fSBbY29udGVudF0gQXJyYXkgb2YgY29udGVudCB3aXRoaW4gdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7YXJyYXl9IFtwYXJlbnRzXSBBcnJheSBvZiBwYXJlbnQgdGVtcGxhdGVzIGZvciB0aGUgY3VycmVudCB0ZW1wbGF0ZSBjb250ZXh0LlxuICAgICAqIEBwYXJhbSB7U3dpZ09wdHN9IFtvcHRpb25zXSBTd2lnIE9wdGlvbnMgT2JqZWN0XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtibG9ja05hbWVdIE5hbWUgb2YgdGhlIGRpcmVjdCBibG9jayBwYXJlbnQsIGlmIGFueS5cbiAgICAgKi9cbiAgICBvID0gdG9rZW4uY29tcGlsZShleHBvcnRzLmNvbXBpbGUsIHRva2VuLmFyZ3MgPyB0b2tlbi5hcmdzLnNsaWNlKDApIDogW10sIHRva2VuLmNvbnRlbnQgPyB0b2tlbi5jb250ZW50LnNsaWNlKDApIDogW10sIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSk7XG4gICAgb3V0ICs9IG8gfHwgJyc7XG4gIH0pO1xuXG4gIHJldHVybiBvdXQ7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi9wYXJzZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyksXG4gIF90YWdzID0gcmVxdWlyZSgnLi90YWdzJyksXG4gIF9maWx0ZXJzID0gcmVxdWlyZSgnLi9maWx0ZXJzJyksXG4gIHBhcnNlciA9IHJlcXVpcmUoJy4vcGFyc2VyJyksXG4gIGRhdGVmb3JtYXR0ZXIgPSByZXF1aXJlKCcuL2RhdGVmb3JtYXR0ZXInKSxcbiAgbG9hZGVycyA9IHJlcXVpcmUoJy4vbG9hZGVycycpO1xuXG4vKipcbiAqIFN3aWcgdmVyc2lvbiBudW1iZXIgYXMgYSBzdHJpbmcuXG4gKiBAZXhhbXBsZVxuICogaWYgKHN3aWcudmVyc2lvbiA9PT0gXCIxLjMuMlwiKSB7IC4uLiB9XG4gKlxuICogQHR5cGUge1N0cmluZ31cbiAqL1xuZXhwb3J0cy52ZXJzaW9uID0gXCIxLjMuMlwiO1xuXG4vKipcbiAqIFN3aWcgT3B0aW9ucyBPYmplY3QuIFRoaXMgb2JqZWN0IGNhbiBiZSBwYXNzZWQgdG8gbWFueSBvZiB0aGUgQVBJLWxldmVsIFN3aWcgbWV0aG9kcyB0byBjb250cm9sIHZhcmlvdXMgYXNwZWN0cyBvZiB0aGUgZW5naW5lLiBBbGwga2V5cyBhcmUgb3B0aW9uYWwuXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBTd2lnT3B0c1xuICogQHByb3BlcnR5IHtib29sZWFufSBhdXRvZXNjYXBlICBDb250cm9scyB3aGV0aGVyIG9yIG5vdCB2YXJpYWJsZSBvdXRwdXQgd2lsbCBhdXRvbWF0aWNhbGx5IGJlIGVzY2FwZWQgZm9yIHNhZmUgSFRNTCBvdXRwdXQuIERlZmF1bHRzIHRvIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPnRydWU8L2NvZGU+LiBGdW5jdGlvbnMgZXhlY3V0ZWQgaW4gdmFyaWFibGUgc3RhdGVtZW50cyB3aWxsIG5vdCBiZSBhdXRvLWVzY2FwZWQuIFlvdXIgYXBwbGljYXRpb24vZnVuY3Rpb25zIHNob3VsZCB0YWtlIGNhcmUgb2YgdGhlaXIgb3duIGF1dG8tZXNjYXBpbmcuXG4gKiBAcHJvcGVydHkge2FycmF5fSAgIHZhckNvbnRyb2xzIE9wZW4gYW5kIGNsb3NlIGNvbnRyb2xzIGZvciB2YXJpYWJsZXMuIERlZmF1bHRzIHRvIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPlsne3snLCAnfX0nXTwvY29kZT4uXG4gKiBAcHJvcGVydHkge2FycmF5fSAgIHRhZ0NvbnRyb2xzIE9wZW4gYW5kIGNsb3NlIGNvbnRyb2xzIGZvciB0YWdzLiBEZWZhdWx0cyB0byA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5bJ3slJywgJyV9J108L2NvZGU+LlxuICogQHByb3BlcnR5IHthcnJheX0gICBjbXRDb250cm9scyBPcGVuIGFuZCBjbG9zZSBjb250cm9scyBmb3IgY29tbWVudHMuIERlZmF1bHRzIHRvIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPlsneyMnLCAnI30nXTwvY29kZT4uXG4gKiBAcHJvcGVydHkge29iamVjdH0gIGxvY2FscyAgICAgIERlZmF1bHQgdmFyaWFibGUgY29udGV4dCB0byBiZSBwYXNzZWQgdG8gPHN0cm9uZz5hbGw8L3N0cm9uZz4gdGVtcGxhdGVzLlxuICogQHByb3BlcnR5IHtDYWNoZU9wdGlvbnN9IGNhY2hlIENhY2hlIGNvbnRyb2wgZm9yIHRlbXBsYXRlcy4gRGVmYXVsdHMgdG8gc2F2aW5nIGluIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJqc1wiPidtZW1vcnknPC9jb2RlPi4gU2VuZCA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5mYWxzZTwvY29kZT4gdG8gZGlzYWJsZS4gU2VuZCBhbiBvYmplY3Qgd2l0aCA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5nZXQ8L2NvZGU+IGFuZCA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5zZXQ8L2NvZGU+IGZ1bmN0aW9ucyB0byBjdXN0b21pemUuXG4gKiBAcHJvcGVydHkge1RlbXBsYXRlTG9hZGVyfSBsb2FkZXIgVGhlIG1ldGhvZCB0aGF0IFN3aWcgd2lsbCB1c2UgdG8gbG9hZCB0ZW1wbGF0ZXMuIERlZmF1bHRzIHRvIDx2YXI+c3dpZy5sb2FkZXJzLmZzPC92YXI+LlxuICovXG52YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgYXV0b2VzY2FwZTogdHJ1ZSxcbiAgICB2YXJDb250cm9sczogWyd7eycsICd9fSddLFxuICAgIHRhZ0NvbnRyb2xzOiBbJ3slJywgJyV9J10sXG4gICAgY210Q29udHJvbHM6IFsneyMnLCAnI30nXSxcbiAgICBsb2NhbHM6IHt9LFxuICAgIC8qKlxuICAgICAqIENhY2hlIGNvbnRyb2wgZm9yIHRlbXBsYXRlcy4gRGVmYXVsdHMgdG8gc2F2aW5nIGFsbCB0ZW1wbGF0ZXMgaW50byBtZW1vcnkuXG4gICAgICogQHR5cGVkZWYge2Jvb2xlYW58c3RyaW5nfG9iamVjdH0gQ2FjaGVPcHRpb25zXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBEZWZhdWx0XG4gICAgICogc3dpZy5zZXREZWZhdWx0cyh7IGNhY2hlOiAnbWVtb3J5JyB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIERpc2FibGVzIGNhY2hpbmcgaW4gU3dpZy5cbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHsgY2FjaGU6IGZhbHNlIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3VzdG9tIGNhY2hlIHN0b3JhZ2UgYW5kIHJldHJpZXZhbFxuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoe1xuICAgICAqICAgY2FjaGU6IHtcbiAgICAgKiAgICAgZ2V0OiBmdW5jdGlvbiAoa2V5KSB7IC4uLiB9LFxuICAgICAqICAgICBzZXQ6IGZ1bmN0aW9uIChrZXksIHZhbCkgeyAuLi4gfVxuICAgICAqICAgfVxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGNhY2hlOiAnbWVtb3J5JyxcbiAgICAvKipcbiAgICAgKiBDb25maWd1cmUgU3dpZyB0byB1c2UgZWl0aGVyIHRoZSA8dmFyPnN3aWcubG9hZGVycy5mczwvdmFyPiBvciA8dmFyPnN3aWcubG9hZGVycy5tZW1vcnk8L3Zhcj4gdGVtcGxhdGUgbG9hZGVyLiBPciwgeW91IGNhbiB3cml0ZSB5b3VyIG93biFcbiAgICAgKiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHNlZSB0aGUgPGEgaHJlZj1cIi4uL2xvYWRlcnMvXCI+VGVtcGxhdGUgTG9hZGVycyBkb2N1bWVudGF0aW9uPC9hPi5cbiAgICAgKiBAdHlwZWRlZiB7Y2xhc3N9IFRlbXBsYXRlTG9hZGVyXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBEZWZhdWx0LCBGaWxlU3lzdGVtIGxvYWRlclxuICAgICAqIHN3aWcuc2V0RGVmYXVsdHMoeyBsb2FkZXI6IHN3aWcubG9hZGVycy5mcygpIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRmlsZVN5c3RlbSBsb2FkZXIgYWxsb3dpbmcgYSBiYXNlIHBhdGhcbiAgICAgKiAvLyBXaXRoIHRoaXMsIHlvdSBkb24ndCB1c2UgcmVsYXRpdmUgVVJMcyBpbiB5b3VyIHRlbXBsYXRlIHJlZmVyZW5jZXNcbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMuZnMoX19kaXJuYW1lICsgJy90ZW1wbGF0ZXMnKSB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIE1lbW9yeSBMb2FkZXJcbiAgICAgKiBzd2lnLnNldERlZmF1bHRzKHsgbG9hZGVyOiBzd2lnLmxvYWRlcnMubWVtb3J5KHtcbiAgICAgKiAgIGxheW91dDogJ3slIGJsb2NrIGZvbyAlfXslIGVuZGJsb2NrICV9JyxcbiAgICAgKiAgIHBhZ2UxOiAneyUgZXh0ZW5kcyBcImxheW91dFwiICV9eyUgYmxvY2sgZm9vICV9VGFjb3MheyUgZW5kYmxvY2sgJX0nXG4gICAgICogfSl9KTtcbiAgICAgKi9cbiAgICBsb2FkZXI6IGxvYWRlcnMuZnMoKVxuICB9LFxuICBkZWZhdWx0SW5zdGFuY2U7XG5cbi8qKlxuICogRW1wdHkgZnVuY3Rpb24sIHVzZWQgaW4gdGVtcGxhdGVzLlxuICogQHJldHVybiB7c3RyaW5nfSBFbXB0eSBzdHJpbmdcbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGVmbigpIHsgcmV0dXJuICcnOyB9XG5cbi8qKlxuICogVmFsaWRhdGUgdGhlIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0gIHs/U3dpZ09wdHN9IG9wdGlvbnMgU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEByZXR1cm4ge3VuZGVmaW5lZH0gICAgICBUaGlzIG1ldGhvZCB3aWxsIHRocm93IGVycm9ycyBpZiBhbnl0aGluZyBpcyB3cm9uZy5cbiAqIEBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKSB7XG4gIGlmICghb3B0aW9ucykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHV0aWxzLmVhY2goWyd2YXJDb250cm9scycsICd0YWdDb250cm9scycsICdjbXRDb250cm9scyddLCBmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKCFvcHRpb25zLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCF1dGlscy5pc0FycmF5KG9wdGlvbnNba2V5XSkgfHwgb3B0aW9uc1trZXldLmxlbmd0aCAhPT0gMikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPcHRpb24gXCInICsga2V5ICsgJ1wiIG11c3QgYmUgYW4gYXJyYXkgY29udGFpbmluZyAyIGRpZmZlcmVudCBjb250cm9sIHN0cmluZ3MuJyk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zW2tleV1bMF0gPT09IG9wdGlvbnNba2V5XVsxXSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPcHRpb24gXCInICsga2V5ICsgJ1wiIG9wZW4gYW5kIGNsb3NlIGNvbnRyb2xzIG11c3Qgbm90IGJlIHRoZSBzYW1lLicpO1xuICAgIH1cbiAgICB1dGlscy5lYWNoKG9wdGlvbnNba2V5XSwgZnVuY3Rpb24gKGEsIGkpIHtcbiAgICAgIGlmIChhLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdPcHRpb24gXCInICsga2V5ICsgJ1wiICcgKyAoKGkpID8gJ29wZW4gJyA6ICdjbG9zZSAnKSArICdjb250cm9sIG11c3QgYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzLiBTYXcgXCInICsgYSArICdcIiBpbnN0ZWFkLicpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnY2FjaGUnKSkge1xuICAgIGlmIChvcHRpb25zLmNhY2hlICYmIG9wdGlvbnMuY2FjaGUgIT09ICdtZW1vcnknKSB7XG4gICAgICBpZiAoIW9wdGlvbnMuY2FjaGUuZ2V0IHx8ICFvcHRpb25zLmNhY2hlLnNldCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY2FjaGUgb3B0aW9uICcgKyBKU09OLnN0cmluZ2lmeShvcHRpb25zLmNhY2hlKSArICcgZm91bmQuIEV4cGVjdGVkIFwibWVtb3J5XCIgb3IgeyBnZXQ6IGZ1bmN0aW9uIChrZXkpIHsgLi4uIH0sIHNldDogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHsgLi4uIH0gfS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ2xvYWRlcicpKSB7XG4gICAgaWYgKG9wdGlvbnMubG9hZGVyKSB7XG4gICAgICBpZiAoIW9wdGlvbnMubG9hZGVyLmxvYWQgfHwgIW9wdGlvbnMubG9hZGVyLnJlc29sdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvYWRlciBvcHRpb24gJyArIEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubG9hZGVyKSArICcgZm91bmQuIEV4cGVjdGVkIHsgbG9hZDogZnVuY3Rpb24gKHBhdGhuYW1lLCBjYikgeyAuLi4gfSwgcmVzb2x2ZTogZnVuY3Rpb24gKHRvLCBmcm9tKSB7IC4uLiB9IH0uJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbn1cblxuLyoqXG4gKiBTZXQgZGVmYXVsdHMgZm9yIHRoZSBiYXNlIGFuZCBhbGwgbmV3IFN3aWcgZW52aXJvbm1lbnRzLlxuICpcbiAqIEBleGFtcGxlXG4gKiBzd2lnLnNldERlZmF1bHRzKHsgY2FjaGU6IGZhbHNlIH0pO1xuICogLy8gPT4gRGlzYWJsZXMgQ2FjaGVcbiAqXG4gKiBAZXhhbXBsZVxuICogc3dpZy5zZXREZWZhdWx0cyh7IGxvY2FsczogeyBub3c6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG5ldyBEYXRlKCk7IH0gfX0pO1xuICogLy8gPT4gc2V0cyBhIGdsb2JhbGx5IGFjY2Vzc2libGUgbWV0aG9kIGZvciBhbGwgdGVtcGxhdGVcbiAqIC8vICAgIGNvbnRleHRzLCBhbGxvd2luZyB5b3UgdG8gcHJpbnQgdGhlIGN1cnJlbnQgZGF0ZVxuICogLy8gPT4ge3sgbm93KCl8ZGF0ZSgnRiBqUywgWScpIH19XG4gKlxuICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICogQHJldHVybiB7dW5kZWZpbmVkfVxuICovXG5leHBvcnRzLnNldERlZmF1bHRzID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG4gIHZhciBsb2NhbHMgPSB1dGlscy5leHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLmxvY2Fscywgb3B0aW9ucy5sb2NhbHMgfHwge30pO1xuXG4gIHV0aWxzLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG4gIGRlZmF1bHRPcHRpb25zLmxvY2FscyA9IGxvY2FscztcblxuICBkZWZhdWx0SW5zdGFuY2Uub3B0aW9ucyA9IHV0aWxzLmV4dGVuZChkZWZhdWx0SW5zdGFuY2Uub3B0aW9ucywgb3B0aW9ucyk7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgZGVmYXVsdCBUaW1lWm9uZSBvZmZzZXQgZm9yIGRhdGUgZm9ybWF0dGluZyB2aWEgdGhlIGRhdGUgZmlsdGVyLiBUaGlzIGlzIGEgZ2xvYmFsIHNldHRpbmcgYW5kIHdpbGwgYWZmZWN0IGFsbCBTd2lnIGVudmlyb25tZW50cywgb2xkIG9yIG5ldy5cbiAqIEBwYXJhbSAge251bWJlcn0gb2Zmc2V0IE9mZnNldCBmcm9tIEdNVCwgaW4gbWludXRlcy5cbiAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAqL1xuZXhwb3J0cy5zZXREZWZhdWx0VFpPZmZzZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGRhdGVmb3JtYXR0ZXIudHpPZmZzZXQgPSBvZmZzZXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhIG5ldywgc2VwYXJhdGUgU3dpZyBjb21waWxlL3JlbmRlciBlbnZpcm9ubWVudC5cbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIHN3aWcgPSByZXF1aXJlKCdzd2lnJyk7XG4gKiB2YXIgbXlzd2lnID0gbmV3IHN3aWcuU3dpZyh7dmFyQ29udHJvbHM6IFsnPCU9JywgJyU+J119KTtcbiAqIG15c3dpZy5yZW5kZXIoJ1RhY29zIGFyZSA8JT0gdGFjb3MgPT4hJywgeyBsb2NhbHM6IHsgdGFjb3M6ICdkZWxpY2lvdXMnIH19KTtcbiAqIC8vID0+IFRhY29zIGFyZSBkZWxpY2lvdXMhXG4gKiBzd2lnLnJlbmRlcignVGFjb3MgYXJlIDwlPSB0YWNvcyA9PiEnLCB7IGxvY2FsczogeyB0YWNvczogJ2RlbGljaW91cycgfX0pO1xuICogLy8gPT4gJ1RhY29zIGFyZSA8JT0gdGFjb3MgPT4hJ1xuICpcbiAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0cz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAqIEByZXR1cm4ge29iamVjdH0gICAgICBOZXcgU3dpZyBlbnZpcm9ubWVudC5cbiAqL1xuZXhwb3J0cy5Td2lnID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFsaWRhdGVPcHRpb25zKG9wdHMpO1xuICB0aGlzLm9wdGlvbnMgPSB1dGlscy5leHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzIHx8IHt9KTtcbiAgdGhpcy5jYWNoZSA9IHt9O1xuICB0aGlzLmV4dGVuc2lvbnMgPSB7fTtcbiAgdmFyIHNlbGYgPSB0aGlzLFxuICAgIHRhZ3MgPSBfdGFncyxcbiAgICBmaWx0ZXJzID0gX2ZpbHRlcnM7XG5cbiAgLyoqXG4gICAqIEdldCBjb21iaW5lZCBsb2NhbHMgY29udGV4dC5cbiAgICogQHBhcmFtICB7P1N3aWdPcHRzfSBbb3B0aW9uc10gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7b2JqZWN0fSAgICAgICAgIExvY2FscyBjb250ZXh0LlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0TG9jYWxzKG9wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMgfHwgIW9wdGlvbnMubG9jYWxzKSB7XG4gICAgICByZXR1cm4gc2VsZi5vcHRpb25zLmxvY2FscztcbiAgICB9XG5cbiAgICByZXR1cm4gdXRpbHMuZXh0ZW5kKHt9LCBzZWxmLm9wdGlvbnMubG9jYWxzLCBvcHRpb25zLmxvY2Fscyk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGNvbXBpbGVkIHRlbXBsYXRlIGZyb20gdGhlIGNhY2hlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IGtleSAgICAgICAgICAgTmFtZSBvZiB0ZW1wbGF0ZS5cbiAgICogQHJldHVybiB7b2JqZWN0fHVuZGVmaW5lZH0gICAgIFRlbXBsYXRlIGZ1bmN0aW9uIGFuZCB0b2tlbnMuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBmdW5jdGlvbiBjYWNoZUdldChrZXkpIHtcbiAgICBpZiAoIXNlbGYub3B0aW9ucy5jYWNoZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzZWxmLm9wdGlvbnMuY2FjaGUgPT09ICdtZW1vcnknKSB7XG4gICAgICByZXR1cm4gc2VsZi5jYWNoZVtrZXldO1xuICAgIH1cblxuICAgIHJldHVybiBzZWxmLm9wdGlvbnMuY2FjaGUuZ2V0KGtleSk7XG4gIH1cblxuICAvKipcbiAgICogU3RvcmUgYSB0ZW1wbGF0ZSBpbiB0aGUgY2FjaGUuXG4gICAqIEBwYXJhbSAge3N0cmluZ30ga2V5IE5hbWUgb2YgdGVtcGxhdGUuXG4gICAqIEBwYXJhbSAge29iamVjdH0gdmFsIFRlbXBsYXRlIGZ1bmN0aW9uIGFuZCB0b2tlbnMuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIGNhY2hlU2V0KGtleSwgdmFsKSB7XG4gICAgaWYgKCFzZWxmLm9wdGlvbnMuY2FjaGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc2VsZi5vcHRpb25zLmNhY2hlID09PSAnbWVtb3J5Jykge1xuICAgICAgc2VsZi5jYWNoZVtrZXldID0gdmFsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNlbGYub3B0aW9ucy5jYWNoZS5zZXQoa2V5LCB2YWwpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFycyB0aGUgaW4tbWVtb3J5IHRlbXBsYXRlIGNhY2hlLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLmludmFsaWRhdGVDYWNoZSgpO1xuICAgKlxuICAgKiBAcmV0dXJuIHt1bmRlZmluZWR9XG4gICAqL1xuICB0aGlzLmludmFsaWRhdGVDYWNoZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoc2VsZi5vcHRpb25zLmNhY2hlID09PSAnbWVtb3J5Jykge1xuICAgICAgc2VsZi5jYWNoZSA9IHt9O1xuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICogQWRkIGEgY3VzdG9tIGZpbHRlciBmb3Igc3dpZyB2YXJpYWJsZXMuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGZ1bmN0aW9uIHJlcGxhY2VNcyhpbnB1dCkgeyByZXR1cm4gaW5wdXQucmVwbGFjZSgvbS9nLCAnZicpOyB9XG4gICAqIHN3aWcuc2V0RmlsdGVyKCdyZXBsYWNlTXMnLCByZXBsYWNlTXMpO1xuICAgKiAvLyA9PiB7eyBcIm9ub21hdG9wb2VpYVwifHJlcGxhY2VNcyB9fVxuICAgKiAvLyA9PiBvbm9mYXRvcGVpYVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gICAgbmFtZSAgICBOYW1lIG9mIGZpbHRlciwgdXNlZCBpbiB0ZW1wbGF0ZXMuIDxzdHJvbmc+V2lsbDwvc3Ryb25nPiBvdmVyd3JpdGUgcHJldmlvdXNseSBkZWZpbmVkIGZpbHRlcnMsIGlmIHVzaW5nIHRoZSBzYW1lIG5hbWUuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259ICBtZXRob2QgIEZ1bmN0aW9uIHRoYXQgYWN0cyBhZ2FpbnN0IHRoZSBpbnB1dC4gU2VlIDxhIGhyZWY9XCIvZG9jcy9maWx0ZXJzLyNjdXN0b21cIj5DdXN0b20gRmlsdGVyczwvYT4gZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICovXG4gIHRoaXMuc2V0RmlsdGVyID0gZnVuY3Rpb24gKG5hbWUsIG1ldGhvZCkge1xuICAgIGlmICh0eXBlb2YgbWV0aG9kICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsdGVyIFwiJyArIG5hbWUgKyAnXCIgaXMgbm90IGEgdmFsaWQgZnVuY3Rpb24uJyk7XG4gICAgfVxuICAgIGZpbHRlcnNbbmFtZV0gPSBtZXRob2Q7XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIGN1c3RvbSB0YWcuIFRvIGV4cG9zZSB5b3VyIG93biBleHRlbnNpb25zIHRvIGNvbXBpbGVkIHRlbXBsYXRlIGNvZGUsIHNlZSA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj5zd2lnLnNldEV4dGVuc2lvbjwvY29kZT4uXG4gICAqXG4gICAqIEZvciBhIG1vcmUgaW4tZGVwdGggZXhwbGFuYXRpb24gb2Ygd3JpdGluZyBjdXN0b20gdGFncywgc2VlIDxhIGhyZWY9XCIuLi9leHRlbmRpbmcvI3RhZ3NcIj5DdXN0b20gVGFnczwvYT4uXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHZhciB0YWNvdGFnID0gcmVxdWlyZSgnLi90YWNvdGFnJyk7XG4gICAqIHN3aWcuc2V0VGFnKCd0YWNvcycsIHRhY290YWcucGFyc2UsIHRhY290YWcuY29tcGlsZSwgdGFjb3RhZy5lbmRzLCB0YWNvdGFnLmJsb2NrTGV2ZWwpO1xuICAgKiAvLyA9PiB7JSB0YWNvcyAlfU1ha2UgdGhpcyBiZSB0YWNvcy57JSBlbmR0YWNvcyAlfVxuICAgKiAvLyA9PiBUYWNvcyB0YWNvcyB0YWNvcyB0YWNvcy5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBuYW1lICAgICAgVGFnIG5hbWUuXG4gICAqIEBwYXJhbSAge2Z1bmN0aW9ufSBwYXJzZSAgIE1ldGhvZCBmb3IgcGFyc2luZyB0b2tlbnMuXG4gICAqIEBwYXJhbSAge2Z1bmN0aW9ufSBjb21waWxlIE1ldGhvZCBmb3IgY29tcGlsaW5nIHJlbmRlcmFibGUgb3V0cHV0LlxuICAgKiBAcGFyYW0gIHtib29sZWFufSBbZW5kcz1mYWxzZV0gICAgIFdoZXRoZXIgb3Igbm90IHRoaXMgdGFnIHJlcXVpcmVzIGFuIDxpPmVuZDwvaT4gdGFnLlxuICAgKiBAcGFyYW0gIHtib29sZWFufSBbYmxvY2tMZXZlbD1mYWxzZV0gSWYgZmFsc2UsIHRoaXMgdGFnIHdpbGwgbm90IGJlIGNvbXBpbGVkIG91dHNpZGUgb2YgPGNvZGU+YmxvY2s8L2NvZGU+IHRhZ3Mgd2hlbiBleHRlbmRpbmcgYSBwYXJlbnQgdGVtcGxhdGUuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICovXG4gIHRoaXMuc2V0VGFnID0gZnVuY3Rpb24gKG5hbWUsIHBhcnNlLCBjb21waWxlLCBlbmRzLCBibG9ja0xldmVsKSB7XG4gICAgaWYgKHR5cGVvZiBwYXJzZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYWcgXCInICsgbmFtZSArICdcIiBwYXJzZSBtZXRob2QgaXMgbm90IGEgdmFsaWQgZnVuY3Rpb24uJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjb21waWxlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhZyBcIicgKyBuYW1lICsgJ1wiIGNvbXBpbGUgbWV0aG9kIGlzIG5vdCBhIHZhbGlkIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIHRhZ3NbbmFtZV0gPSB7XG4gICAgICBwYXJzZTogcGFyc2UsXG4gICAgICBjb21waWxlOiBjb21waWxlLFxuICAgICAgZW5kczogZW5kcyB8fCBmYWxzZSxcbiAgICAgIGJsb2NrOiAhIWJsb2NrTGV2ZWxcbiAgICB9O1xuICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgZXh0ZW5zaW9ucyBmb3IgY3VzdG9tIHRhZ3MuIFRoaXMgYWxsb3dzIGFueSBjdXN0b20gdGFnIHRvIGFjY2VzcyBhIGdsb2JhbGx5IGF2YWlsYWJsZSBtZXRob2RzIHZpYSBhIHNwZWNpYWwgZ2xvYmFsbHkgYXZhaWxhYmxlIG9iamVjdCwgPHZhcj5fZXh0PC92YXI+LCBpbiB0ZW1wbGF0ZXMuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcuc2V0RXh0ZW5zaW9uKCd0cmFucycsIGZ1bmN0aW9uICh2KSB7IHJldHVybiB0cmFuc2xhdGUodik7IH0pO1xuICAgKiBmdW5jdGlvbiBjb21waWxlVHJhbnMoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudCwgb3B0aW9ucykge1xuICAgKiAgIHJldHVybiAnX291dHB1dCArPSBfZXh0LnRyYW5zKCcgKyBhcmdzWzBdICsgJyk7J1xuICAgKiB9O1xuICAgKiBzd2lnLnNldFRhZygndHJhbnMnLCBwYXJzZVRyYW5zLCBjb21waWxlVHJhbnMsIHRydWUpO1xuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IG5hbWUgICBLZXkgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uLiBBY2Nlc3NlZCB2aWEgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+X2V4dFtuYW1lXTwvY29kZT4uXG4gICAqIEBwYXJhbSAgeyp9ICAgICAgb2JqZWN0IFRoZSBtZXRob2QsIHZhbHVlLCBvciBvYmplY3QgdGhhdCBzaG91bGQgYmUgYXZhaWxhYmxlIHZpYSB0aGUgZ2l2ZW4gbmFtZS5cbiAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgKi9cbiAgdGhpcy5zZXRFeHRlbnNpb24gPSBmdW5jdGlvbiAobmFtZSwgb2JqZWN0KSB7XG4gICAgc2VsZi5leHRlbnNpb25zW25hbWVdID0gb2JqZWN0O1xuICB9O1xuXG4gIC8qKlxuICAgKiBQYXJzZSBhIGdpdmVuIHNvdXJjZSBzdHJpbmcgaW50byB0b2tlbnMuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc291cmNlICBTd2lnIHRlbXBsYXRlIHNvdXJjZS5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtvYmplY3R9IHBhcnNlZCAgVGVtcGxhdGUgdG9rZW5zIG9iamVjdC5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHRoaXMucGFyc2UgPSBmdW5jdGlvbiAoc291cmNlLCBvcHRpb25zKSB7XG4gICAgdmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG4gICAgdmFyIGxvY2FscyA9IGdldExvY2FscyhvcHRpb25zKSxcbiAgICAgIG9wdHMgPSB7fSxcbiAgICAgIGs7XG5cbiAgICBmb3IgKGsgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaykgJiYgayAhPT0gJ2xvY2FscycpIHtcbiAgICAgICAgb3B0c1trXSA9IG9wdGlvbnNba107XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IHV0aWxzLmV4dGVuZCh7fSwgc2VsZi5vcHRpb25zLCBvcHRzKTtcbiAgICBvcHRpb25zLmxvY2FscyA9IGxvY2FscztcblxuICAgIHJldHVybiBwYXJzZXIucGFyc2Uoc291cmNlLCBvcHRpb25zLCB0YWdzLCBmaWx0ZXJzKTtcbiAgfTtcblxuICAvKipcbiAgICogUGFyc2UgYSBnaXZlbiBmaWxlIGludG8gdG9rZW5zLlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHBhdGhuYW1lICBGdWxsIHBhdGggdG8gZmlsZSB0byBwYXJzZS5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSAgIFN3aWcgb3B0aW9ucyBvYmplY3QuXG4gICAqIEByZXR1cm4ge29iamVjdH0gcGFyc2VkICAgIFRlbXBsYXRlIHRva2VucyBvYmplY3QuXG4gICAqIEBwcml2YXRlXG4gICAqL1xuICB0aGlzLnBhcnNlRmlsZSA9IGZ1bmN0aW9uIChwYXRobmFtZSwgb3B0aW9ucykge1xuICAgIHZhciBzcmM7XG5cbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICBwYXRobmFtZSA9IHNlbGYub3B0aW9ucy5sb2FkZXIucmVzb2x2ZShwYXRobmFtZSwgb3B0aW9ucy5yZXNvbHZlRnJvbSk7XG5cbiAgICBzcmMgPSBzZWxmLm9wdGlvbnMubG9hZGVyLmxvYWQocGF0aG5hbWUpO1xuXG4gICAgaWYgKCFvcHRpb25zLmZpbGVuYW1lKSB7XG4gICAgICBvcHRpb25zID0gdXRpbHMuZXh0ZW5kKHsgZmlsZW5hbWU6IHBhdGhuYW1lIH0sIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIHJldHVybiBzZWxmLnBhcnNlKHNyYywgb3B0aW9ucyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFJlLU1hcCBibG9ja3Mgd2l0aGluIGEgbGlzdCBvZiB0b2tlbnMgdG8gdGhlIHRlbXBsYXRlJ3MgYmxvY2sgb2JqZWN0cy5cbiAgICogQHBhcmFtICB7YXJyYXl9ICB0b2tlbnMgICBMaXN0IG9mIHRva2VucyBmb3IgdGhlIHBhcmVudCBvYmplY3QuXG4gICAqIEBwYXJhbSAge29iamVjdH0gdGVtcGxhdGUgQ3VycmVudCB0ZW1wbGF0ZSB0aGF0IG5lZWRzIHRvIGJlIG1hcHBlZCB0byB0aGUgIHBhcmVudCdzIGJsb2NrIGFuZCB0b2tlbiBsaXN0LlxuICAgKiBAcmV0dXJuIHthcnJheX1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIHJlbWFwQmxvY2tzKGJsb2NrcywgdG9rZW5zKSB7XG4gICAgcmV0dXJuIHV0aWxzLm1hcCh0b2tlbnMsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgdmFyIGFyZ3MgPSB0b2tlbi5hcmdzID8gdG9rZW4uYXJncy5qb2luKCcnKSA6ICcnO1xuICAgICAgaWYgKHRva2VuLm5hbWUgPT09ICdibG9jaycgJiYgYmxvY2tzW2FyZ3NdKSB7XG4gICAgICAgIHRva2VuID0gYmxvY2tzW2FyZ3NdO1xuICAgICAgfVxuICAgICAgaWYgKHRva2VuLmNvbnRlbnQgJiYgdG9rZW4uY29udGVudC5sZW5ndGgpIHtcbiAgICAgICAgdG9rZW4uY29udGVudCA9IHJlbWFwQmxvY2tzKGJsb2NrcywgdG9rZW4uY29udGVudCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdG9rZW47XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogSW1wb3J0IGJsb2NrLWxldmVsIHRhZ3MgdG8gdGhlIHRva2VuIGxpc3QgdGhhdCBhcmUgbm90IGFjdHVhbCBibG9jayB0YWdzLlxuICAgKiBAcGFyYW0gIHthcnJheX0gYmxvY2tzIExpc3Qgb2YgYmxvY2stbGV2ZWwgdGFncy5cbiAgICogQHBhcmFtICB7YXJyYXl9IHRva2VucyBMaXN0IG9mIHRva2VucyB0byByZW5kZXIuXG4gICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIGltcG9ydE5vbkJsb2NrcyhibG9ja3MsIHRva2Vucykge1xuICAgIHV0aWxzLmVhY2goYmxvY2tzLCBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgIGlmIChibG9jay5uYW1lICE9PSAnYmxvY2snKSB7XG4gICAgICAgIHRva2Vucy51bnNoaWZ0KGJsb2NrKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWN1cnNpdmVseSBjb21waWxlIGFuZCBnZXQgcGFyZW50cyBvZiBnaXZlbiBwYXJzZWQgdG9rZW4gb2JqZWN0LlxuICAgKlxuICAgKiBAcGFyYW0gIHtvYmplY3R9IHRva2VucyAgICBQYXJzZWQgdG9rZW5zIGZyb20gdGVtcGxhdGUuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gICBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcmV0dXJuIHtvYmplY3R9ICAgICAgICAgICBQYXJzZWQgdG9rZW5zIGZyb20gcGFyZW50IHRlbXBsYXRlcy5cbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIGdldFBhcmVudHModG9rZW5zLCBvcHRpb25zKSB7XG4gICAgdmFyIHBhcmVudE5hbWUgPSB0b2tlbnMucGFyZW50LFxuICAgICAgcGFyZW50RmlsZXMgPSBbXSxcbiAgICAgIHBhcmVudHMgPSBbXSxcbiAgICAgIHBhcmVudEZpbGUsXG4gICAgICBwYXJlbnQsXG4gICAgICBsO1xuXG4gICAgd2hpbGUgKHBhcmVudE5hbWUpIHtcbiAgICAgIGlmICghb3B0aW9ucyB8fCAhb3B0aW9ucy5maWxlbmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBleHRlbmQgXCInICsgcGFyZW50TmFtZSArICdcIiBiZWNhdXNlIGN1cnJlbnQgdGVtcGxhdGUgaGFzIG5vIGZpbGVuYW1lLicpO1xuICAgICAgfVxuXG4gICAgICBwYXJlbnRGaWxlID0gcGFyZW50RmlsZSB8fCBvcHRpb25zLmZpbGVuYW1lO1xuICAgICAgcGFyZW50RmlsZSA9IHNlbGYub3B0aW9ucy5sb2FkZXIucmVzb2x2ZShwYXJlbnROYW1lLCBwYXJlbnRGaWxlKTtcbiAgICAgIHBhcmVudCA9IGNhY2hlR2V0KHBhcmVudEZpbGUpIHx8IHNlbGYucGFyc2VGaWxlKHBhcmVudEZpbGUsIHV0aWxzLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBmaWxlbmFtZTogcGFyZW50RmlsZSB9KSk7XG4gICAgICBwYXJlbnROYW1lID0gcGFyZW50LnBhcmVudDtcblxuICAgICAgaWYgKHBhcmVudEZpbGVzLmluZGV4T2YocGFyZW50RmlsZSkgIT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSWxsZWdhbCBjaXJjdWxhciBleHRlbmRzIG9mIFwiJyArIHBhcmVudEZpbGUgKyAnXCIuJyk7XG4gICAgICB9XG4gICAgICBwYXJlbnRGaWxlcy5wdXNoKHBhcmVudEZpbGUpO1xuXG4gICAgICBwYXJlbnRzLnB1c2gocGFyZW50KTtcbiAgICB9XG5cbiAgICAvLyBSZW1hcCBlYWNoIHBhcmVudHMnKDEpIGJsb2NrcyBvbnRvIGl0cyBvd24gcGFyZW50KDIpLCByZWNlaXZpbmcgdGhlIGZ1bGwgdG9rZW4gbGlzdCBmb3IgcmVuZGVyaW5nIHRoZSBvcmlnaW5hbCBwYXJlbnQoMSkgb24gaXRzIG93bi5cbiAgICBsID0gcGFyZW50cy5sZW5ndGg7XG4gICAgZm9yIChsID0gcGFyZW50cy5sZW5ndGggLSAyOyBsID49IDA7IGwgLT0gMSkge1xuICAgICAgcGFyZW50c1tsXS50b2tlbnMgPSByZW1hcEJsb2NrcyhwYXJlbnRzW2xdLmJsb2NrcywgcGFyZW50c1tsICsgMV0udG9rZW5zKTtcbiAgICAgIGltcG9ydE5vbkJsb2NrcyhwYXJlbnRzW2xdLmJsb2NrcywgcGFyZW50c1tsXS50b2tlbnMpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJlbnRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFByZS1jb21waWxlIGEgc291cmNlIHN0cmluZyBpbnRvIGEgY2FjaGUtYWJsZSB0ZW1wbGF0ZSBmdW5jdGlvbi5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5wcmVjb21waWxlKCd7eyB0YWNvcyB9fScpO1xuICAgKiAvLyA9PiB7XG4gICAqIC8vICAgICAgdHBsOiBmdW5jdGlvbiAoX3N3aWcsIF9sb2NhbHMsIF9maWx0ZXJzLCBfdXRpbHMsIF9mbikgeyAuLi4gfSxcbiAgICogLy8gICAgICB0b2tlbnM6IHtcbiAgICogLy8gICAgICAgIG5hbWU6IHVuZGVmaW5lZCxcbiAgICogLy8gICAgICAgIHBhcmVudDogbnVsbCxcbiAgICogLy8gICAgICAgIHRva2VuczogWy4uLl0sXG4gICAqIC8vICAgICAgICBibG9ja3M6IHt9XG4gICAqIC8vICAgICAgfVxuICAgKiAvLyAgICB9XG4gICAqXG4gICAqIEluIG9yZGVyIHRvIHJlbmRlciBhIHByZS1jb21waWxlZCB0ZW1wbGF0ZSwgeW91IG11c3QgaGF2ZSBhY2Nlc3MgdG8gZmlsdGVycyBhbmQgdXRpbHMgZnJvbSBTd2lnLiA8dmFyPmVmbjwvdmFyPiBpcyBzaW1wbHkgYW4gZW1wdHkgZnVuY3Rpb24gdGhhdCBkb2VzIG5vdGhpbmcuXG4gICAqXG4gICAqIEBwYXJhbSAge3N0cmluZ30gc291cmNlICBTd2lnIHRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7b2JqZWN0fSAgICAgICAgIFJlbmRlcmFibGUgZnVuY3Rpb24gYW5kIHRva2VucyBvYmplY3QuXG4gICAqL1xuICB0aGlzLnByZWNvbXBpbGUgPSBmdW5jdGlvbiAoc291cmNlLCBvcHRpb25zKSB7XG4gICAgdmFyIHRva2VucyA9IHNlbGYucGFyc2Uoc291cmNlLCBvcHRpb25zKSxcbiAgICAgIHBhcmVudHMgPSBnZXRQYXJlbnRzKHRva2Vucywgb3B0aW9ucyksXG4gICAgICB0cGw7XG5cbiAgICBpZiAocGFyZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIFJlbWFwIHRoZSB0ZW1wbGF0ZXMgZmlyc3QtcGFyZW50J3MgdG9rZW5zIHVzaW5nIHRoaXMgdGVtcGxhdGUncyBibG9ja3MuXG4gICAgICB0b2tlbnMudG9rZW5zID0gcmVtYXBCbG9ja3ModG9rZW5zLmJsb2NrcywgcGFyZW50c1swXS50b2tlbnMpO1xuICAgICAgaW1wb3J0Tm9uQmxvY2tzKHRva2Vucy5ibG9ja3MsIHRva2Vucy50b2tlbnMpO1xuICAgIH1cblxuICAgIHRwbCA9IG5ldyBGdW5jdGlvbignX3N3aWcnLCAnX2N0eCcsICdfZmlsdGVycycsICdfdXRpbHMnLCAnX2ZuJyxcbiAgICAgICcgIHZhciBfZXh0ID0gX3N3aWcuZXh0ZW5zaW9ucyxcXG4nICtcbiAgICAgICcgICAgX291dHB1dCA9IFwiXCI7XFxuJyArXG4gICAgICBwYXJzZXIuY29tcGlsZSh0b2tlbnMsIHBhcmVudHMsIG9wdGlvbnMpICsgJ1xcbicgK1xuICAgICAgJyAgcmV0dXJuIF9vdXRwdXQ7XFxuJ1xuICAgICAgKTtcblxuICAgIHJldHVybiB7IHRwbDogdHBsLCB0b2tlbnM6IHRva2VucyB9O1xuICB9O1xuXG4gIC8qKlxuICAgKiBDb21waWxlIGFuZCByZW5kZXIgYSB0ZW1wbGF0ZSBzdHJpbmcgZm9yIGZpbmFsIG91dHB1dC5cbiAgICpcbiAgICogV2hlbiByZW5kZXJpbmcgYSBzb3VyY2Ugc3RyaW5nLCBhIGZpbGUgcGF0aCBzaG91bGQgYmUgc3BlY2lmaWVkIGluIHRoZSBvcHRpb25zIG9iamVjdCBpbiBvcmRlciBmb3IgPHZhcj5leHRlbmRzPC92YXI+LCA8dmFyPmluY2x1ZGU8L3Zhcj4sIGFuZCA8dmFyPmltcG9ydDwvdmFyPiB0byB3b3JrIHByb3Blcmx5LiBEbyB0aGlzIGJ5IGFkZGluZyA8Y29kZSBkYXRhLWxhbmd1YWdlPVwianNcIj57IGZpbGVuYW1lOiAnL2Fic29sdXRlL3BhdGgvdG8vbXl0cGwuaHRtbCcgfTwvY29kZT4gdG8gdGhlIG9wdGlvbnMgYXJndW1lbnQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHN3aWcucmVuZGVyKCd7eyB0YWNvcyB9fScsIHsgbG9jYWxzOiB7IHRhY29zOiAnVGFjb3MhISEhJyB9fSk7XG4gICAqIC8vID0+IFRhY29zISEhIVxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHNvdXJjZSAgICBTd2lnIHRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7c3RyaW5nfSAgICAgICAgICAgUmVuZGVyZWQgb3V0cHV0LlxuICAgKi9cbiAgdGhpcy5yZW5kZXIgPSBmdW5jdGlvbiAoc291cmNlLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIHNlbGYuY29tcGlsZShzb3VyY2UsIG9wdGlvbnMpKCk7XG4gIH07XG5cbiAgLyoqXG4gICAqIENvbXBpbGUgYW5kIHJlbmRlciBhIHRlbXBsYXRlIGZpbGUgZm9yIGZpbmFsIG91dHB1dC4gVGhpcyBpcyBtb3N0IHVzZWZ1bCBmb3IgbGlicmFyaWVzIGxpa2UgRXhwcmVzcy5qcy5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5yZW5kZXJGaWxlKCcuL3RlbXBsYXRlLmh0bWwnLCB7fSwgZnVuY3Rpb24gKGVyciwgb3V0cHV0KSB7XG4gICAqICAgaWYgKGVycikge1xuICAgKiAgICAgdGhyb3cgZXJyO1xuICAgKiAgIH1cbiAgICogICBjb25zb2xlLmxvZyhvdXRwdXQpO1xuICAgKiB9KTtcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogc3dpZy5yZW5kZXJGaWxlKCcuL3RlbXBsYXRlLmh0bWwnLCB7fSk7XG4gICAqIC8vID0+IG91dHB1dFxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9ICAgcGF0aE5hbWUgICAgRmlsZSBsb2NhdGlvbi5cbiAgICogQHBhcmFtICB7b2JqZWN0fSAgIFtsb2NhbHM9e31dIFRlbXBsYXRlIHZhcmlhYmxlIGNvbnRleHQuXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbY2JdIEFzeW5jcm9ub3VzIGNhbGxiYWNrIGZ1bmN0aW9uLiBJZiBub3QgcHJvdmlkZWQsIDx2YXI+Y29tcGlsZUZpbGU8L3Zhcj4gd2lsbCBydW4gc3luY3Jvbm91c2x5LlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgIFJlbmRlcmVkIG91dHB1dC5cbiAgICovXG4gIHRoaXMucmVuZGVyRmlsZSA9IGZ1bmN0aW9uIChwYXRoTmFtZSwgbG9jYWxzLCBjYikge1xuICAgIGlmIChjYikge1xuICAgICAgc2VsZi5jb21waWxlRmlsZShwYXRoTmFtZSwge30sIGZ1bmN0aW9uIChlcnIsIGZuKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjYihudWxsLCBmbihsb2NhbHMpKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiBzZWxmLmNvbXBpbGVGaWxlKHBhdGhOYW1lKShsb2NhbHMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDb21waWxlIHN0cmluZyBzb3VyY2UgaW50byBhIHJlbmRlcmFibGUgdGVtcGxhdGUgZnVuY3Rpb24uXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIHZhciB0cGwgPSBzd2lnLmNvbXBpbGUoJ3t7IHRhY29zIH19Jyk7XG4gICAqIC8vID0+IHtcbiAgICogLy8gICAgICBbRnVuY3Rpb246IGNvbXBpbGVkXVxuICAgKiAvLyAgICAgIHBhcmVudDogbnVsbCxcbiAgICogLy8gICAgICB0b2tlbnM6IFt7IGNvbXBpbGU6IFtGdW5jdGlvbl0gfV0sXG4gICAqIC8vICAgICAgYmxvY2tzOiB7fVxuICAgKiAvLyAgICB9XG4gICAqIHRwbCh7IHRhY29zOiAnVGFjb3MhISEhJyB9KTtcbiAgICogLy8gPT4gVGFjb3MhISEhXG4gICAqXG4gICAqIFdoZW4gY29tcGlsaW5nIGEgc291cmNlIHN0cmluZywgYSBmaWxlIHBhdGggc2hvdWxkIGJlIHNwZWNpZmllZCBpbiB0aGUgb3B0aW9ucyBvYmplY3QgaW4gb3JkZXIgZm9yIDx2YXI+ZXh0ZW5kczwvdmFyPiwgPHZhcj5pbmNsdWRlPC92YXI+LCBhbmQgPHZhcj5pbXBvcnQ8L3Zhcj4gdG8gd29yayBwcm9wZXJseS4gRG8gdGhpcyBieSBhZGRpbmcgPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+eyBmaWxlbmFtZTogJy9hYnNvbHV0ZS9wYXRoL3RvL215dHBsLmh0bWwnIH08L2NvZGU+IHRvIHRoZSBvcHRpb25zIGFyZ3VtZW50LlxuICAgKlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IHNvdXJjZSAgICBTd2lnIHRlbXBsYXRlIHNvdXJjZSBzdHJpbmcuXG4gICAqIEBwYXJhbSAge1N3aWdPcHRzfSBbb3B0aW9ucz17fV0gU3dpZyBvcHRpb25zIG9iamVjdC5cbiAgICogQHJldHVybiB7ZnVuY3Rpb259ICAgICAgICAgUmVuZGVyYWJsZSBmdW5jdGlvbiB3aXRoIGtleXMgZm9yIHBhcmVudCwgYmxvY2tzLCBhbmQgdG9rZW5zLlxuICAgKi9cbiAgdGhpcy5jb21waWxlID0gZnVuY3Rpb24gKHNvdXJjZSwgb3B0aW9ucykge1xuICAgIHZhciBrZXkgPSBvcHRpb25zID8gb3B0aW9ucy5maWxlbmFtZSA6IG51bGwsXG4gICAgICBjYWNoZWQgPSBrZXkgPyBjYWNoZUdldChrZXkpIDogbnVsbCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBjb250ZXh0TGVuZ3RoLFxuICAgICAgcHJlO1xuXG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgcmV0dXJuIGNhY2hlZDtcbiAgICB9XG5cbiAgICBjb250ZXh0ID0gZ2V0TG9jYWxzKG9wdGlvbnMpO1xuICAgIGNvbnRleHRMZW5ndGggPSB1dGlscy5rZXlzKGNvbnRleHQpLmxlbmd0aDtcbiAgICBwcmUgPSB0aGlzLnByZWNvbXBpbGUoc291cmNlLCBvcHRpb25zKTtcblxuICAgIGZ1bmN0aW9uIGNvbXBpbGVkKGxvY2Fscykge1xuICAgICAgdmFyIGxjbHM7XG4gICAgICBpZiAobG9jYWxzICYmIGNvbnRleHRMZW5ndGgpIHtcbiAgICAgICAgbGNscyA9IHV0aWxzLmV4dGVuZCh7fSwgY29udGV4dCwgbG9jYWxzKTtcbiAgICAgIH0gZWxzZSBpZiAobG9jYWxzICYmICFjb250ZXh0TGVuZ3RoKSB7XG4gICAgICAgIGxjbHMgPSBsb2NhbHM7XG4gICAgICB9IGVsc2UgaWYgKCFsb2NhbHMgJiYgY29udGV4dExlbmd0aCkge1xuICAgICAgICBsY2xzID0gY29udGV4dDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxjbHMgPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcmUudHBsKHNlbGYsIGxjbHMsIGZpbHRlcnMsIHV0aWxzLCBlZm4pO1xuICAgIH1cblxuICAgIHV0aWxzLmV4dGVuZChjb21waWxlZCwgcHJlLnRva2Vucyk7XG5cbiAgICBpZiAoa2V5KSB7XG4gICAgICBjYWNoZVNldChrZXksIGNvbXBpbGVkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29tcGlsZWQ7XG4gIH07XG5cbiAgLyoqXG4gICAqIENvbXBpbGUgYSBzb3VyY2UgZmlsZSBpbnRvIGEgcmVuZGVyYWJsZSB0ZW1wbGF0ZSBmdW5jdGlvbi5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogdmFyIHRwbCA9IHN3aWcuY29tcGlsZUZpbGUoJy4vbXl0cGwuaHRtbCcpO1xuICAgKiAvLyA9PiB7XG4gICAqIC8vICAgICAgW0Z1bmN0aW9uOiBjb21waWxlZF1cbiAgICogLy8gICAgICBwYXJlbnQ6IG51bGwsXG4gICAqIC8vICAgICAgdG9rZW5zOiBbeyBjb21waWxlOiBbRnVuY3Rpb25dIH1dLFxuICAgKiAvLyAgICAgIGJsb2Nrczoge31cbiAgICogLy8gICAgfVxuICAgKiB0cGwoeyB0YWNvczogJ1RhY29zISEhIScgfSk7XG4gICAqIC8vID0+IFRhY29zISEhIVxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBzd2lnLmNvbXBpbGVGaWxlKCcvbXlmaWxlLnR4dCcsIHsgdmFyQ29udHJvbHM6IFsnPCU9JywgJz0lPiddLCB0YWdDb250cm9sczogWyc8JScsICclPiddfSk7XG4gICAqIC8vID0+IHdpbGwgY29tcGlsZSAnbXlmaWxlLnR4dCcgdXNpbmcgdGhlIHZhciBhbmQgdGFnIGNvbnRyb2xzIGFzIHNwZWNpZmllZC5cbiAgICpcbiAgICogQHBhcmFtICB7c3RyaW5nfSBwYXRobmFtZSAgRmlsZSBsb2NhdGlvbi5cbiAgICogQHBhcmFtICB7U3dpZ09wdHN9IFtvcHRpb25zPXt9XSBTd2lnIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcGFyYW0gIHtGdW5jdGlvbn0gW2NiXSBBc3luY3Jvbm91cyBjYWxsYmFjayBmdW5jdGlvbi4gSWYgbm90IHByb3ZpZGVkLCA8dmFyPmNvbXBpbGVGaWxlPC92YXI+IHdpbGwgcnVuIHN5bmNyb25vdXNseS5cbiAgICogQHJldHVybiB7ZnVuY3Rpb259ICAgICAgICAgUmVuZGVyYWJsZSBmdW5jdGlvbiB3aXRoIGtleXMgZm9yIHBhcmVudCwgYmxvY2tzLCBhbmQgdG9rZW5zLlxuICAgKi9cbiAgdGhpcy5jb21waWxlRmlsZSA9IGZ1bmN0aW9uIChwYXRobmFtZSwgb3B0aW9ucywgY2IpIHtcbiAgICB2YXIgc3JjLCBjYWNoZWQ7XG5cbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICBwYXRobmFtZSA9IHNlbGYub3B0aW9ucy5sb2FkZXIucmVzb2x2ZShwYXRobmFtZSwgb3B0aW9ucy5yZXNvbHZlRnJvbSk7XG4gICAgaWYgKCFvcHRpb25zLmZpbGVuYW1lKSB7XG4gICAgICBvcHRpb25zID0gdXRpbHMuZXh0ZW5kKHsgZmlsZW5hbWU6IHBhdGhuYW1lIH0sIG9wdGlvbnMpO1xuICAgIH1cbiAgICBjYWNoZWQgPSBjYWNoZUdldChwYXRobmFtZSk7XG5cbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgY2IobnVsbCwgY2FjaGVkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNhY2hlZDtcbiAgICB9XG5cbiAgICBpZiAoY2IpIHtcbiAgICAgIHNlbGYub3B0aW9ucy5sb2FkZXIubG9hZChwYXRobmFtZSwgZnVuY3Rpb24gKGVyciwgc3JjKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGlsZWQ7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb21waWxlZCA9IHNlbGYuY29tcGlsZShzcmMsIG9wdGlvbnMpO1xuICAgICAgICB9IGNhdGNoIChlcnIyKSB7XG4gICAgICAgICAgY2IoZXJyMik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY2IoZXJyLCBjb21waWxlZCk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzcmMgPSBzZWxmLm9wdGlvbnMubG9hZGVyLmxvYWQocGF0aG5hbWUpO1xuICAgIHJldHVybiBzZWxmLmNvbXBpbGUoc3JjLCBvcHRpb25zKTtcbiAgfTtcblxuICAvKipcbiAgICogUnVuIGEgcHJlLWNvbXBpbGVkIHRlbXBsYXRlIGZ1bmN0aW9uLiBUaGlzIGlzIG1vc3QgdXNlZnVsIGluIHRoZSBicm93c2VyIHdoZW4geW91J3ZlIHByZS1jb21waWxlZCB5b3VyIHRlbXBsYXRlcyB3aXRoIHRoZSBTd2lnIGNvbW1hbmQtbGluZSB0b29sLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiAkIHN3aWcgY29tcGlsZSAuL215dHBsLmh0bWwgLS13cmFwLXN0YXJ0PVwidmFyIG15dHBsID0gXCIgPiBteXRwbC5qc1xuICAgKiBAZXhhbXBsZVxuICAgKiA8c2NyaXB0IHNyYz1cIm15dHBsLmpzXCI+PC9zY3JpcHQ+XG4gICAqIDxzY3JpcHQ+XG4gICAqICAgc3dpZy5ydW4obXl0cGwsIHt9KTtcbiAgICogICAvLyA9PiBcInJlbmRlcmVkIHRlbXBsYXRlLi4uXCJcbiAgICogPC9zY3JpcHQ+XG4gICAqXG4gICAqIEBwYXJhbSAge2Z1bmN0aW9ufSB0cGwgICAgICAgUHJlLWNvbXBpbGVkIFN3aWcgdGVtcGxhdGUgZnVuY3Rpb24uIFVzZSB0aGUgU3dpZyBDTEkgdG8gY29tcGlsZSB5b3VyIHRlbXBsYXRlcy5cbiAgICogQHBhcmFtICB7b2JqZWN0fSBbbG9jYWxzPXt9XSBUZW1wbGF0ZSB2YXJpYWJsZSBjb250ZXh0LlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9IFtmaWxlcGF0aF0gIEZpbGVuYW1lIHVzZWQgZm9yIGNhY2hpbmcgdGhlIHRlbXBsYXRlLlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgICAgICAgIFJlbmRlcmVkIG91dHB1dC5cbiAgICovXG4gIHRoaXMucnVuID0gZnVuY3Rpb24gKHRwbCwgbG9jYWxzLCBmaWxlcGF0aCkge1xuICAgIHZhciBjb250ZXh0ID0gZ2V0TG9jYWxzKHsgbG9jYWxzOiBsb2NhbHMgfSk7XG4gICAgaWYgKGZpbGVwYXRoKSB7XG4gICAgICBjYWNoZVNldChmaWxlcGF0aCwgdHBsKTtcbiAgICB9XG4gICAgcmV0dXJuIHRwbChzZWxmLCBjb250ZXh0LCBmaWx0ZXJzLCB1dGlscywgZWZuKTtcbiAgfTtcbn07XG5cbi8qIVxuICogRXhwb3J0IG1ldGhvZHMgcHVibGljbHlcbiAqL1xuZGVmYXVsdEluc3RhbmNlID0gbmV3IGV4cG9ydHMuU3dpZygpO1xuZXhwb3J0cy5zZXRGaWx0ZXIgPSBkZWZhdWx0SW5zdGFuY2Uuc2V0RmlsdGVyO1xuZXhwb3J0cy5zZXRUYWcgPSBkZWZhdWx0SW5zdGFuY2Uuc2V0VGFnO1xuZXhwb3J0cy5zZXRFeHRlbnNpb24gPSBkZWZhdWx0SW5zdGFuY2Uuc2V0RXh0ZW5zaW9uO1xuZXhwb3J0cy5wYXJzZUZpbGUgPSBkZWZhdWx0SW5zdGFuY2UucGFyc2VGaWxlO1xuZXhwb3J0cy5wcmVjb21waWxlID0gZGVmYXVsdEluc3RhbmNlLnByZWNvbXBpbGU7XG5leHBvcnRzLmNvbXBpbGUgPSBkZWZhdWx0SW5zdGFuY2UuY29tcGlsZTtcbmV4cG9ydHMuY29tcGlsZUZpbGUgPSBkZWZhdWx0SW5zdGFuY2UuY29tcGlsZUZpbGU7XG5leHBvcnRzLnJlbmRlciA9IGRlZmF1bHRJbnN0YW5jZS5yZW5kZXI7XG5leHBvcnRzLnJlbmRlckZpbGUgPSBkZWZhdWx0SW5zdGFuY2UucmVuZGVyRmlsZTtcbmV4cG9ydHMucnVuID0gZGVmYXVsdEluc3RhbmNlLnJ1bjtcbmV4cG9ydHMuaW52YWxpZGF0ZUNhY2hlID0gZGVmYXVsdEluc3RhbmNlLmludmFsaWRhdGVDYWNoZTtcbmV4cG9ydHMubG9hZGVycyA9IGxvYWRlcnM7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3N3aWcuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpLFxuICBzdHJpbmdzID0gWydodG1sJywgJ2pzJ107XG5cbi8qKlxuICogQ29udHJvbCBhdXRvLWVzY2FwaW5nIG9mIHZhcmlhYmxlIG91dHB1dCBmcm9tIHdpdGhpbiB5b3VyIHRlbXBsYXRlcy5cbiAqXG4gKiBAYWxpYXMgYXV0b2VzY2FwZVxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBteXZhciA9ICc8Zm9vPic7XG4gKiB7JSBhdXRvZXNjYXBlIHRydWUgJX17eyBteXZhciB9fXslIGVuZGF1dG9lc2NhcGUgJX1cbiAqIC8vID0+ICZsdDtmb28mZ3Q7XG4gKiB7JSBhdXRvZXNjYXBlIGZhbHNlICV9e3sgbXl2YXIgfX17JSBlbmRhdXRvZXNjYXBlICV9XG4gKiAvLyA9PiA8Zm9vPlxuICpcbiAqIEBwYXJhbSB7Ym9vbGVhbnxzdHJpbmd9IGNvbnRyb2wgT25lIG9mIGB0cnVlYCwgYGZhbHNlYCwgYFwianNcImAgb3IgYFwiaHRtbFwiYC5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgcmV0dXJuIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSk7XG59O1xuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrLCBvcHRzKSB7XG4gIHZhciBtYXRjaGVkO1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIW1hdGNoZWQgJiZcbiAgICAgICAgKHRva2VuLnR5cGUgPT09IHR5cGVzLkJPT0wgfHxcbiAgICAgICAgICAodG9rZW4udHlwZSA9PT0gdHlwZXMuU1RSSU5HICYmIHN0cmluZ3MuaW5kZXhPZih0b2tlbi5tYXRjaCkgPT09IC0xKSlcbiAgICAgICAgKSB7XG4gICAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgICAgIG1hdGNoZWQgPSB0cnVlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB1dGlscy50aHJvd0Vycm9yKCdVbmV4cGVjdGVkIHRva2VuIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIGluIGF1dG9lc2NhcGUgdGFnJywgbGluZSwgb3B0cy5maWxlbmFtZSk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvYXV0b2VzY2FwZS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBEZWZpbmVzIGEgYmxvY2sgaW4gYSB0ZW1wbGF0ZSB0aGF0IGNhbiBiZSBvdmVycmlkZGVuIGJ5IGEgdGVtcGxhdGUgZXh0ZW5kaW5nIHRoaXMgb25lIGFuZC9vciB3aWxsIG92ZXJyaWRlIHRoZSBjdXJyZW50IHRlbXBsYXRlJ3MgcGFyZW50IHRlbXBsYXRlIGJsb2NrIG9mIHRoZSBzYW1lIG5hbWUuXG4gKlxuICogU2VlIDxhIGhyZWY9XCIjaW5oZXJpdGFuY2VcIj5UZW1wbGF0ZSBJbmhlcml0YW5jZTwvYT4gZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gKlxuICogQGFsaWFzIGJsb2NrXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGJsb2NrIGJvZHkgJX0uLi57JSBlbmRibG9jayAlfVxuICpcbiAqIEBwYXJhbSB7bGl0ZXJhbH0gIG5hbWUgICBOYW1lIG9mIHRoZSBibG9jayBmb3IgdXNlIGluIHBhcmVudCBhbmQgZXh0ZW5kZWQgdGVtcGxhdGVzLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGFyZ3Muam9pbignJykpO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlcikge1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcbmV4cG9ydHMuYmxvY2sgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Jsb2NrLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIFVzZWQgd2l0aGluIGFuIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgaWYgJX08L2NvZGU+IHRhZywgdGhlIGNvZGUgYmxvY2sgZm9sbG93aW5nIHRoaXMgdGFnIHVwIHVudGlsIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgZW5kaWYgJX08L2NvZGU+IHdpbGwgYmUgcmVuZGVyZWQgaWYgdGhlIDxpPmlmPC9pPiBzdGF0ZW1lbnQgcmV0dXJucyBmYWxzZS5cbiAqXG4gKiBAYWxpYXMgZWxzZVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiBmYWxzZSAlfVxuICogICBzdGF0ZW1lbnQxXG4gKiB7JSBlbHNlICV9XG4gKiAgIHN0YXRlbWVudDJcbiAqIHslIGVuZGlmICV9XG4gKiAvLyA9PiBzdGF0ZW1lbnQyXG4gKlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiAnfSBlbHNlIHtcXG4nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrKSB7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRocm93IG5ldyBFcnJvcignXCJlbHNlXCIgdGFnIGRvZXMgbm90IGFjY2VwdCBhbnkgdG9rZW5zLiBGb3VuZCBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG5cbiAgcmV0dXJuIChzdGFjay5sZW5ndGggJiYgc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0ubmFtZSA9PT0gJ2lmJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Vsc2UuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBpZnBhcnNlciA9IHJlcXVpcmUoJy4vaWYnKS5wYXJzZTtcblxuLyoqXG4gKiBMaWtlIDxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgZWxzZSAlfTwvY29kZT4sIGV4Y2VwdCB0aGlzIHRhZyBjYW4gdGFrZSBtb3JlIGNvbmRpdGlvbmFsIHN0YXRlbWVudHMuXG4gKlxuICogQGFsaWFzIGVsc2VpZlxuICogQGFsaWFzIGVsaWZcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgZmFsc2UgJX1cbiAqICAgVGFjb3NcbiAqIHslIGVsc2VpZiB0cnVlICV9XG4gKiAgIEJ1cnJpdG9zXG4gKiB7JSBlbHNlICV9XG4gKiAgIENodXJyb3NcbiAqIHslIGVuZGlmICV9XG4gKiAvLyA9PiBCdXJyaXRvc1xuICpcbiAqIEBwYXJhbSB7Li4ubWl4ZWR9IGNvbmRpdGlvbmFsICBDb25kaXRpb25hbCBzdGF0ZW1lbnQgdGhhdCByZXR1cm5zIGEgdHJ1dGh5IG9yIGZhbHN5IHZhbHVlLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MpIHtcbiAgcmV0dXJuICd9IGVsc2UgaWYgKCcgKyBhcmdzLmpvaW4oJyAnKSArICcpIHtcXG4nO1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrKSB7XG4gIHZhciBva2F5ID0gaWZwYXJzZXIoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzLCBzdGFjayk7XG4gIHJldHVybiBva2F5ICYmIChzdGFjay5sZW5ndGggJiYgc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0ubmFtZSA9PT0gJ2lmJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Vsc2VpZi5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBNYWtlcyB0aGUgY3VycmVudCB0ZW1wbGF0ZSBleHRlbmQgYSBwYXJlbnQgdGVtcGxhdGUuIFRoaXMgdGFnIG11c3QgYmUgdGhlIGZpcnN0IGl0ZW0gaW4geW91ciB0ZW1wbGF0ZS5cbiAqXG4gKiBTZWUgPGEgaHJlZj1cIiNpbmhlcml0YW5jZVwiPlRlbXBsYXRlIEluaGVyaXRhbmNlPC9hPiBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cbiAqXG4gKiBAYWxpYXMgZXh0ZW5kc1xuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBleHRlbmRzIFwiLi9sYXlvdXQuaHRtbFwiICV9XG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHBhcmVudEZpbGUgIFJlbGF0aXZlIHBhdGggdG8gdGhlIGZpbGUgdGhhdCB0aGlzIHRlbXBsYXRlIGV4dGVuZHMuXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uICgpIHt9O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IGZhbHNlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2V4dGVuZHMuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBmaWx0ZXJzID0gcmVxdWlyZSgnLi4vZmlsdGVycycpO1xuXG4vKipcbiAqIEFwcGx5IGEgZmlsdGVyIHRvIGFuIGVudGlyZSBibG9jayBvZiB0ZW1wbGF0ZS5cbiAqXG4gKiBAYWxpYXMgZmlsdGVyXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGZpbHRlciB1cHBlcmNhc2UgJX1vaCBoaSwge3sgbmFtZSB9fXslIGVuZGZpbHRlciAlfVxuICogLy8gPT4gT0ggSEksIFBBVUxcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgZmlsdGVyIHJlcGxhY2UoXCIuXCIsIFwiIVwiLCBcImdcIikgJX1IaS4gTXkgbmFtZSBpcyBQYXVsLnslIGVuZGZpbHRlciAlfVxuICogLy8gPT4gSGkhIE15IG5hbWUgaXMgUGF1bCFcbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBmaWx0ZXIgIFRoZSBmaWx0ZXIgdGhhdCBzaG91bGQgYmUgYXBwbGllZCB0byB0aGUgY29udGVudHMgb2YgdGhlIHRhZy5cbiAqL1xuXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MsIGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkge1xuICB2YXIgZmlsdGVyID0gYXJncy5zaGlmdCgpLnJlcGxhY2UoL1xcKCQvLCAnJyksXG4gICAgdmFsID0gJyhmdW5jdGlvbiAoKSB7XFxuJyArXG4gICAgICAnICB2YXIgX291dHB1dCA9IFwiXCI7XFxuJyArXG4gICAgICBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpICtcbiAgICAgICcgIHJldHVybiBfb3V0cHV0O1xcbicgK1xuICAgICAgJ30pKCknO1xuXG4gIGlmIChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09ICcpJykge1xuICAgIGFyZ3MucG9wKCk7XG4gIH1cblxuICBhcmdzID0gKGFyZ3MubGVuZ3RoKSA/ICcsICcgKyBhcmdzLmpvaW4oJycpIDogJyc7XG4gIHJldHVybiAnX291dHB1dCArPSBfZmlsdGVyc1tcIicgKyBmaWx0ZXIgKyAnXCJdKCcgKyB2YWwgKyBhcmdzICsgJyk7XFxuJztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzKSB7XG4gIHZhciBmaWx0ZXI7XG5cbiAgZnVuY3Rpb24gY2hlY2soZmlsdGVyKSB7XG4gICAgaWYgKCFmaWx0ZXJzLmhhc093blByb3BlcnR5KGZpbHRlcikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsdGVyIFwiJyArIGZpbHRlciArICdcIiBkb2VzIG5vdCBleGlzdCBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gIH1cblxuICBwYXJzZXIub24odHlwZXMuRlVOQ1RJT04sIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghZmlsdGVyKSB7XG4gICAgICBmaWx0ZXIgPSB0b2tlbi5tYXRjaC5yZXBsYWNlKC9cXCgkLywgJycpO1xuICAgICAgY2hlY2soZmlsdGVyKTtcbiAgICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgICAgdGhpcy5zdGF0ZS5wdXNoKHRva2VuLnR5cGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFmaWx0ZXIpIHtcbiAgICAgIGZpbHRlciA9IHRva2VuLm1hdGNoO1xuICAgICAgY2hlY2soZmlsdGVyKTtcbiAgICAgIHRoaXMub3V0LnB1c2goZmlsdGVyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9maWx0ZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBjdHggPSAnX2N0eC4nLFxuICBjdHhsb29wID0gY3R4ICsgJ2xvb3AnLFxuICBjdHhsb29wY2FjaGUgPSBjdHggKyAnX19fbG9vcGNhY2hlJztcblxuLyoqXG4gKiBMb29wIG92ZXIgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICpcbiAqIEBhbGlhcyBmb3JcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gb2JqID0geyBvbmU6ICdoaScsIHR3bzogJ2J5ZScgfTtcbiAqIHslIGZvciB4IGluIG9iaiAlfVxuICogICB7JSBpZiBsb29wLmZpcnN0ICV9PHVsPnslIGVuZGlmICV9XG4gKiAgIDxsaT57eyBsb29wLmluZGV4IH19IC0ge3sgbG9vcC5rZXkgfX06IHt7IHggfX08L2xpPlxuICogICB7JSBpZiBsb29wLmxhc3QgJX08L3VsPnslIGVuZGlmICV9XG4gKiB7JSBlbmRmb3IgJX1cbiAqIC8vID0+IDx1bD5cbiAqIC8vICAgIDxsaT4xIC0gb25lOiBoaTwvbGk+XG4gKiAvLyAgICA8bGk+MiAtIHR3bzogYnllPC9saT5cbiAqIC8vICAgIDwvdWw+XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGFyciA9IFsxLCAyLCAzXVxuICogLy8gUmV2ZXJzZSB0aGUgYXJyYXksIHNob3J0Y3V0IHRoZSBrZXkvaW5kZXggdG8gYGtleWBcbiAqIHslIGZvciBrZXksIHZhbCBpbiBhcnJ8cmV2ZXJzZSAlfVxuICoge3sga2V5IH19IC0tIHt7IHZhbCB9fVxuICogeyUgZW5kZm9yICV9XG4gKiAvLyA9PiAwIC0tIDNcbiAqIC8vICAgIDEgLS0gMlxuICogLy8gICAgMiAtLSAxXG4gKlxuICogQHBhcmFtIHtsaXRlcmFsfSBba2V5XSAgICAgQSBzaG9ydGN1dCB0byB0aGUgaW5kZXggb2YgdGhlIGFycmF5IG9yIGN1cnJlbnQga2V5IGFjY2Vzc29yLlxuICogQHBhcmFtIHtsaXRlcmFsfSB2YXJpYWJsZSAgVGhlIGN1cnJlbnQgdmFsdWUgd2lsbCBiZSBhc3NpZ25lZCB0byB0aGlzIHZhcmlhYmxlIG5hbWUgdGVtcG9yYXJpbHkuIFRoZSB2YXJpYWJsZSB3aWxsIGJlIHJlc2V0IHVwb24gZW5kaW5nIHRoZSBmb3IgdGFnLlxuICogQHBhcmFtIHtsaXRlcmFsfSBpbiAgICAgICAgTGl0ZXJhbGx5LCBcImluXCIuIFRoaXMgdG9rZW4gaXMgcmVxdWlyZWQuXG4gKiBAcGFyYW0ge29iamVjdH0gIG9iamVjdCAgICBBbiBlbnVtZXJhYmxlIG9iamVjdCB0aGF0IHdpbGwgYmUgaXRlcmF0ZWQgb3Zlci5cbiAqXG4gKiBAcmV0dXJuIHtsb29wLmluZGV4fSBUaGUgY3VycmVudCBpdGVyYXRpb24gb2YgdGhlIGxvb3AgKDEtaW5kZXhlZClcbiAqIEByZXR1cm4ge2xvb3AuaW5kZXgwfSBUaGUgY3VycmVudCBpdGVyYXRpb24gb2YgdGhlIGxvb3AgKDAtaW5kZXhlZClcbiAqIEByZXR1cm4ge2xvb3AucmV2aW5kZXh9IFRoZSBudW1iZXIgb2YgaXRlcmF0aW9ucyBmcm9tIHRoZSBlbmQgb2YgdGhlIGxvb3AgKDEtaW5kZXhlZClcbiAqIEByZXR1cm4ge2xvb3AucmV2aW5kZXgwfSBUaGUgbnVtYmVyIG9mIGl0ZXJhdGlvbnMgZnJvbSB0aGUgZW5kIG9mIHRoZSBsb29wICgwLWluZGV4ZWQpXG4gKiBAcmV0dXJuIHtsb29wLmtleX0gSWYgdGhlIGl0ZXJhdG9yIGlzIGFuIG9iamVjdCwgdGhpcyB3aWxsIGJlIHRoZSBrZXkgb2YgdGhlIGN1cnJlbnQgaXRlbSwgb3RoZXJ3aXNlIGl0IHdpbGwgYmUgdGhlIHNhbWUgYXMgdGhlIGxvb3AuaW5kZXguXG4gKiBAcmV0dXJuIHtsb29wLmZpcnN0fSBUcnVlIGlmIHRoZSBjdXJyZW50IG9iamVjdCBpcyB0aGUgZmlyc3QgaW4gdGhlIG9iamVjdCBvciBhcnJheS5cbiAqIEByZXR1cm4ge2xvb3AubGFzdH0gVHJ1ZSBpZiB0aGUgY3VycmVudCBvYmplY3QgaXMgdGhlIGxhc3QgaW4gdGhlIG9iamVjdCBvciBhcnJheS5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgdmFyIHZhbCA9IGFyZ3Muc2hpZnQoKSxcbiAgICBrZXkgPSAnX19rJyxcbiAgICBsYXN0O1xuXG4gIGlmIChhcmdzWzBdICYmIGFyZ3NbMF0gPT09ICcsJykge1xuICAgIGFyZ3Muc2hpZnQoKTtcbiAgICBrZXkgPSB2YWw7XG4gICAgdmFsID0gYXJncy5zaGlmdCgpO1xuICB9XG5cbiAgbGFzdCA9IGFyZ3Muam9pbignJyk7XG5cbiAgcmV0dXJuIFtcbiAgICAnKGZ1bmN0aW9uICgpIHtcXG4nLFxuICAgICcgIHZhciBfX2wgPSAnICsgbGFzdCArICcsIF9fbGVuID0gKF91dGlscy5pc0FycmF5KF9fbCkpID8gX19sLmxlbmd0aCA6IF91dGlscy5rZXlzKF9fbCkubGVuZ3RoO1xcbicsXG4gICAgJyAgaWYgKCFfX2wpIHsgcmV0dXJuOyB9XFxuJyxcbiAgICAnICAnICsgY3R4bG9vcGNhY2hlICsgJyA9IHsgbG9vcDogJyArIGN0eGxvb3AgKyAnLCAnICsgdmFsICsgJzogJyArIGN0eCArIHZhbCArICcsICcgKyBrZXkgKyAnOiAnICsgY3R4ICsga2V5ICsgJyB9O1xcbicsXG4gICAgJyAgJyArIGN0eGxvb3AgKyAnID0geyBmaXJzdDogZmFsc2UsIGluZGV4OiAxLCBpbmRleDA6IDAsIHJldmluZGV4OiBfX2xlbiwgcmV2aW5kZXgwOiBfX2xlbiAtIDEsIGxlbmd0aDogX19sZW4sIGxhc3Q6IGZhbHNlIH07XFxuJyxcbiAgICAnICBfdXRpbHMuZWFjaChfX2wsIGZ1bmN0aW9uICgnICsgdmFsICsgJywgJyArIGtleSArICcpIHtcXG4nLFxuICAgICcgICAgJyArIGN0eCArIHZhbCArICcgPSAnICsgdmFsICsgJztcXG4nLFxuICAgICcgICAgJyArIGN0eCArIGtleSArICcgPSAnICsga2V5ICsgJztcXG4nLFxuICAgICcgICAgJyArIGN0eGxvb3AgKyAnLmtleSA9ICcgKyBrZXkgKyAnO1xcbicsXG4gICAgJyAgICAnICsgY3R4bG9vcCArICcuZmlyc3QgPSAoJyArIGN0eGxvb3AgKyAnLmluZGV4MCA9PT0gMCk7XFxuJyxcbiAgICAnICAgICcgKyBjdHhsb29wICsgJy5sYXN0ID0gKCcgKyBjdHhsb29wICsgJy5yZXZpbmRleDAgPT09IDApO1xcbicsXG4gICAgJyAgICAnICsgY29tcGlsZXIoY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSxcbiAgICAnICAgICcgKyBjdHhsb29wICsgJy5pbmRleCArPSAxOyAnICsgY3R4bG9vcCArICcuaW5kZXgwICs9IDE7ICcgKyBjdHhsb29wICsgJy5yZXZpbmRleCAtPSAxOyAnICsgY3R4bG9vcCArICcucmV2aW5kZXgwIC09IDE7XFxuJyxcbiAgICAnICB9KTtcXG4nLFxuICAgICcgICcgKyBjdHhsb29wICsgJyA9ICcgKyBjdHhsb29wY2FjaGUgKyAnLmxvb3A7XFxuJyxcbiAgICAnICAnICsgY3R4ICsgdmFsICsgJyA9ICcgKyBjdHhsb29wY2FjaGUgKyAnLicgKyB2YWwgKyAnO1xcbicsXG4gICAgJyAgJyArIGN0eCArIGtleSArICcgPSAnICsgY3R4bG9vcGNhY2hlICsgJy4nICsga2V5ICsgJztcXG4nLFxuICAgICd9KSgpO1xcbidcbiAgXS5qb2luKCcnKTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzKSB7XG4gIHZhciBmaXJzdFZhciwgcmVhZHk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLk5VTUJFUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIGxhc3RTdGF0ZSA9IHRoaXMuc3RhdGUubGVuZ3RoID8gdGhpcy5zdGF0ZVt0aGlzLnN0YXRlLmxlbmd0aCAtIDFdIDogbnVsbDtcbiAgICBpZiAoIXJlYWR5IHx8XG4gICAgICAgIChsYXN0U3RhdGUgIT09IHR5cGVzLkFSUkFZT1BFTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gdHlwZXMuQ1VSTFlPUEVOICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSB0eXBlcy5DVVJMWUNMT1NFICYmXG4gICAgICAgICAgbGFzdFN0YXRlICE9PSB0eXBlcy5GVU5DVElPTiAmJlxuICAgICAgICAgIGxhc3RTdGF0ZSAhPT0gdHlwZXMuRklMVEVSKVxuICAgICAgICApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBudW1iZXIgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAocmVhZHkgJiYgZmlyc3RWYXIpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5vdXQubGVuZ3RoKSB7XG4gICAgICBmaXJzdFZhciA9IHRydWU7XG4gICAgfVxuXG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5DT01NQSwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKGZpcnN0VmFyICYmIHRoaXMucHJldlRva2VuLnR5cGUgPT09IHR5cGVzLlZBUikge1xuICAgICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5DT01QQVJBVE9SLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAodG9rZW4ubWF0Y2ggIT09ICdpbicgfHwgIWZpcnN0VmFyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdG9rZW4gXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIHJlYWR5ID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmVuZHMgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2Zvci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyoqXG4gKiBVc2VkIHRvIGNyZWF0ZSBjb25kaXRpb25hbCBzdGF0ZW1lbnRzIGluIHRlbXBsYXRlcy4gQWNjZXB0cyBtb3N0IEphdmFTY3JpcHQgdmFsaWQgY29tcGFyaXNvbnMuXG4gKlxuICogQ2FuIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCA8YSBocmVmPVwiI2Vsc2VpZlwiPjxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgZWxzZWlmIC4uLiAlfTwvY29kZT48L2E+IGFuZCA8YSBocmVmPVwiI2Vsc2VcIj48Y29kZSBkYXRhLWxhbmd1YWdlPVwic3dpZ1wiPnslIGVsc2UgJX08L2NvZGU+PC9hPiB0YWdzLlxuICpcbiAqIEBhbGlhcyBpZlxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmICF4ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmIG5vdCB4ICV9eyUgZW5kaWYgJX1cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeCBhbmQgeSAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiB4ICYmIHkgJX17JSBlbmRpZiAlfVxuICogeyUgaWYgeCBvciB5ICV9eyUgZW5kaWYgJX1cbiAqIHslIGlmIHggfHwgeSAlfXslIGVuZGlmICV9XG4gKiB7JSBpZiB4IHx8ICh5ICYmIHopICV9eyUgZW5kaWYgJX1cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaWYgeCBbb3BlcmF0b3JdIHkgJX1cbiAqICAgT3BlcmF0b3JzOiA9PSwgIT0sIDwsIDw9LCA+LCA+PSwgPT09LCAhPT1cbiAqIHslIGVuZGlmICV9XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHggPT0gJ2ZpdmUnICV9XG4gKiAgIFRoZSBvcGVyYW5kcyBjYW4gYmUgYWxzbyBiZSBzdHJpbmcgb3IgbnVtYmVyIGxpdGVyYWxzXG4gKiB7JSBlbmRpZiAlfVxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBpZiB4fGxvd2VyID09PSAndGFjb3MnICV9XG4gKiAgIFlvdSBjYW4gdXNlIGZpbHRlcnMgb24gYW55IG9wZXJhbmQgaW4gdGhlIHN0YXRlbWVudC5cbiAqIHslIGVuZGlmICV9XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGlmIHggaW4geSAlfVxuICogICBJZiB4IGlzIGEgdmFsdWUgdGhhdCBpcyBwcmVzZW50IGluIHksIHRoaXMgd2lsbCByZXR1cm4gdHJ1ZS5cbiAqIHslIGVuZGlmICV9XG4gKlxuICogQHBhcmFtIHsuLi5taXhlZH0gY29uZGl0aW9uYWwgQ29uZGl0aW9uYWwgc3RhdGVtZW50IHRoYXQgcmV0dXJucyBhIHRydXRoeSBvciBmYWxzeSB2YWx1ZS5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgcmV0dXJuICdpZiAoJyArIGFyZ3Muam9pbignICcpICsgJykgeyBcXG4nICtcbiAgICBjb21waWxlcihjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpICsgJ1xcbicgK1xuICAgICd9Jztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzKSB7XG4gIHBhcnNlci5vbih0eXBlcy5DT01QQVJBVE9SLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAodGhpcy5pc0xhc3QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBsb2dpYyBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgICB9XG4gICAgaWYgKHRoaXMucHJldlRva2VuLnR5cGUgPT09IHR5cGVzLk5PVCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdHRlbXB0ZWQgbG9naWMgXCJub3QgJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLiBVc2UgIShmb28gJyArIHRva2VuLm1hdGNoICsgJykgaW5zdGVhZC4nKTtcbiAgICB9XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5OT1QsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICh0aGlzLmlzTGFzdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGxvZ2ljIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkJPT0wsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuTE9HSUMsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghdGhpcy5vdXQubGVuZ3RoIHx8IHRoaXMuaXNMYXN0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbG9naWMgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuICAgIHRoaXMub3V0LnB1c2godG9rZW4ubWF0Y2gpO1xuICAgIHRoaXMuZmlsdGVyQXBwbHlJZHgucG9wKCk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pZi5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBBbGxvd3MgeW91IHRvIGltcG9ydCBtYWNyb3MgZnJvbSBhbm90aGVyIGZpbGUgZGlyZWN0bHkgaW50byB5b3VyIGN1cnJlbnQgY29udGV4dC5cbiAqIFRoZSBpbXBvcnQgdGFnIGlzIHNwZWNpZmljYWxseSBkZXNpZ25lZCBmb3IgaW1wb3J0aW5nIG1hY3JvcyBpbnRvIHlvdXIgdGVtcGxhdGUgd2l0aCBhIHNwZWNpZmljIGNvbnRleHQgc2NvcGUuIFRoaXMgaXMgdmVyeSB1c2VmdWwgZm9yIGtlZXBpbmcgeW91ciBtYWNyb3MgZnJvbSBvdmVycmlkaW5nIHRlbXBsYXRlIGNvbnRleHQgdGhhdCBpcyBiZWluZyBpbmplY3RlZCBieSB5b3VyIHNlcnZlci1zaWRlIHBhZ2UgZ2VuZXJhdGlvbi5cbiAqXG4gKiBAYWxpYXMgaW1wb3J0XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGltcG9ydCAnLi9mb3JtbWFjcm9zLmh0bWwnIGFzIGZvcm1zICV9XG4gKiB7eyBmb3JtLmlucHV0KFwidGV4dFwiLCBcIm5hbWVcIikgfX1cbiAqIC8vID0+IDxpbnB1dCB0eXBlPVwidGV4dFwiIG5hbWU9XCJuYW1lXCI+XG4gKlxuICogQGV4YW1wbGVcbiAqIHslIGltcG9ydCBcIi4uL3NoYXJlZC90YWdzLmh0bWxcIiBhcyB0YWdzICV9XG4gKiB7eyB0YWdzLnN0eWxlc2hlZXQoJ2dsb2JhbCcpIH19XG4gKiAvLyA9PiA8bGluayByZWw9XCJzdHlsZXNoZWV0XCIgaHJlZj1cIi9nbG9iYWwuY3NzXCI+XG4gKlxuICogQHBhcmFtIHtzdHJpbmd8dmFyfSAgZmlsZSAgICAgIFJlbGF0aXZlIHBhdGggZnJvbSB0aGUgY3VycmVudCB0ZW1wbGF0ZSBmaWxlIHRvIHRoZSBmaWxlIHRvIGltcG9ydCBtYWNyb3MgZnJvbS5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gICAgIGFzICAgICAgICBMaXRlcmFsbHksIFwiYXNcIi5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gICAgIHZhcm5hbWUgICBMb2NhbC1hY2Nlc3NpYmxlIG9iamVjdCBuYW1lIHRvIGFzc2lnbiB0aGUgbWFjcm9zIHRvLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MpIHtcbiAgdmFyIGN0eCA9IGFyZ3MucG9wKCksXG4gICAgb3V0ID0gJ19jdHguJyArIGN0eCArICcgPSB7fTtcXG4gIHZhciBfb3V0cHV0ID0gXCJcIjtcXG4nLFxuICAgIHJlcGxhY2VtZW50cyA9IHV0aWxzLm1hcChhcmdzLCBmdW5jdGlvbiAoYXJnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBleDogbmV3IFJlZ0V4cCgnX2N0eC4nICsgYXJnLm5hbWUsICdnJyksXG4gICAgICAgIHJlOiAnX2N0eC4nICsgY3R4ICsgJy4nICsgYXJnLm5hbWVcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgLy8gUmVwbGFjZSBhbGwgb2NjdXJyZW5jZXMgb2YgYWxsIG1hY3JvcyBpbiB0aGlzIGZpbGUgd2l0aFxuICAvLyBwcm9wZXIgbmFtZXNwYWNlZCBkZWZpbml0aW9ucyBhbmQgY2FsbHNcbiAgdXRpbHMuZWFjaChhcmdzLCBmdW5jdGlvbiAoYXJnKSB7XG4gICAgdmFyIGMgPSBhcmcuY29tcGlsZWQ7XG4gICAgdXRpbHMuZWFjaChyZXBsYWNlbWVudHMsIGZ1bmN0aW9uIChyZSkge1xuICAgICAgYyA9IGMucmVwbGFjZShyZS5leCwgcmUucmUpO1xuICAgIH0pO1xuICAgIG91dCArPSBjO1xuICB9KTtcblxuICByZXR1cm4gb3V0O1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrLCBvcHRzKSB7XG4gIHZhciBwYXJzZUZpbGUgPSByZXF1aXJlKCcuLi9zd2lnJykucGFyc2VGaWxlLFxuICAgIGNvbXBpbGVyID0gcmVxdWlyZSgnLi4vcGFyc2VyJykuY29tcGlsZSxcbiAgICBwYXJzZU9wdHMgPSB7IHJlc29sdmVGcm9tOiBvcHRzLmZpbGVuYW1lIH0sXG4gICAgY29tcGlsZU9wdHMgPSB1dGlscy5leHRlbmQoe30sIG9wdHMsIHBhcnNlT3B0cyksXG4gICAgdG9rZW5zLFxuICAgIGN0eDtcblxuICBwYXJzZXIub24odHlwZXMuU1RSSU5HLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCF0b2tlbnMpIHtcbiAgICAgIHRva2VucyA9IHBhcnNlRmlsZSh0b2tlbi5tYXRjaC5yZXBsYWNlKC9eKFwifCcpfChcInwnKSQvZywgJycpLCBwYXJzZU9wdHMpLnRva2VucztcbiAgICAgIHV0aWxzLmVhY2godG9rZW5zLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgICAgdmFyIG91dCA9ICcnLFxuICAgICAgICAgIG1hY3JvTmFtZTtcbiAgICAgICAgaWYgKCF0b2tlbiB8fCB0b2tlbi5uYW1lICE9PSAnbWFjcm8nIHx8ICF0b2tlbi5jb21waWxlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG1hY3JvTmFtZSA9IHRva2VuLmFyZ3NbMF07XG4gICAgICAgIG91dCArPSB0b2tlbi5jb21waWxlKGNvbXBpbGVyLCB0b2tlbi5hcmdzLCB0b2tlbi5jb250ZW50LCBbXSwgY29tcGlsZU9wdHMpICsgJ1xcbic7XG4gICAgICAgIHNlbGYub3V0LnB1c2goe2NvbXBpbGVkOiBvdXQsIG5hbWU6IG1hY3JvTmFtZX0pO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHN0cmluZyAnICsgdG9rZW4ubWF0Y2ggKyAnIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuVkFSLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCF0b2tlbnMgfHwgY3R4KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdmFyaWFibGUgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuXG4gICAgaWYgKHRva2VuLm1hdGNoID09PSAnYXMnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY3R4ID0gdG9rZW4ubWF0Y2g7XG4gICAgc2VsZi5vdXQucHVzaChjdHgpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5leHBvcnRzLmJsb2NrID0gdHJ1ZTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFncy9pbXBvcnQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBpZ25vcmUgPSAnaWdub3JlJyxcbiAgbWlzc2luZyA9ICdtaXNzaW5nJyxcbiAgb25seSA9ICdvbmx5JztcblxuLyoqXG4gKiBJbmNsdWRlcyBhIHRlbXBsYXRlIHBhcnRpYWwgaW4gcGxhY2UuIFRoZSB0ZW1wbGF0ZSBpcyByZW5kZXJlZCB3aXRoaW4gdGhlIGN1cnJlbnQgbG9jYWxzIHZhcmlhYmxlIGNvbnRleHQuXG4gKlxuICogQGFsaWFzIGluY2x1ZGVcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gZm9vZCA9ICdidXJyaXRvcyc7XG4gKiAvLyBkcmluayA9ICdsZW1vbmFkZSc7XG4gKiB7JSBpbmNsdWRlIFwiLi9wYXJ0aWFsLmh0bWxcIiAlfVxuICogLy8gPT4gSSBsaWtlIGJ1cnJpdG9zIGFuZCBsZW1vbmFkZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gbXlfb2JqID0geyBmb29kOiAndGFjb3MnLCBkcmluazogJ2hvcmNoYXRhJyB9O1xuICogeyUgaW5jbHVkZSBcIi4vcGFydGlhbC5odG1sXCIgd2l0aCBteV9vYmogb25seSAlfVxuICogLy8gPT4gSSBsaWtlIHRhY29zIGFuZCBob3JjaGF0YS5cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgaW5jbHVkZSBcIi90aGlzL2ZpbGUvZG9lcy9ub3QvZXhpc3RcIiBpZ25vcmUgbWlzc2luZyAlfVxuICogLy8gPT4gKE5vdGhpbmchIGVtcHR5IHN0cmluZylcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ3x2YXJ9ICBmaWxlICAgICAgVGhlIHBhdGgsIHJlbGF0aXZlIHRvIHRoZSB0ZW1wbGF0ZSByb290LCB0byByZW5kZXIgaW50byB0aGUgY3VycmVudCBjb250ZXh0LlxuICogQHBhcmFtIHtsaXRlcmFsfSAgICAgW3dpdGhdICAgIExpdGVyYWxseSwgXCJ3aXRoXCIuXG4gKiBAcGFyYW0ge29iamVjdH0gICAgICBbY29udGV4dF0gTG9jYWwgdmFyaWFibGUga2V5LXZhbHVlIG9iamVjdCBjb250ZXh0IHRvIHByb3ZpZGUgdG8gdGhlIGluY2x1ZGVkIGZpbGUuXG4gKiBAcGFyYW0ge2xpdGVyYWx9ICAgICBbb25seV0gICAgUmVzdHJpY3RzIHRvIDxzdHJvbmc+b25seTwvc3Ryb25nPiBwYXNzaW5nIHRoZSA8Y29kZT53aXRoIGNvbnRleHQ8L2NvZGU+IGFzIGxvY2FsIHZhcmlhYmxlc+KAk3RoZSBpbmNsdWRlZCB0ZW1wbGF0ZSB3aWxsIG5vdCBiZSBhd2FyZSBvZiBhbnkgb3RoZXIgbG9jYWwgdmFyaWFibGVzIGluIHRoZSBwYXJlbnQgdGVtcGxhdGUuIEZvciBiZXN0IHBlcmZvcm1hbmNlLCB1c2FnZSBvZiB0aGlzIG9wdGlvbiBpcyByZWNvbW1lbmRlZCBpZiBwb3NzaWJsZS5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gICAgIFtpZ25vcmUgbWlzc2luZ10gV2lsbCBvdXRwdXQgZW1wdHkgc3RyaW5nIGlmIG5vdCBmb3VuZCBpbnN0ZWFkIG9mIHRocm93aW5nIGFuIGVycm9yLlxuICovXG5leHBvcnRzLmNvbXBpbGUgPSBmdW5jdGlvbiAoY29tcGlsZXIsIGFyZ3MpIHtcbiAgdmFyIGZpbGUgPSBhcmdzLnNoaWZ0KCksXG4gICAgb25seUlkeCA9IGFyZ3MuaW5kZXhPZihvbmx5KSxcbiAgICBvbmx5Q3R4ID0gb25seUlkeCAhPT0gLTEgPyBhcmdzLnNwbGljZShvbmx5SWR4LCAxKSA6IGZhbHNlLFxuICAgIHBhcmVudEZpbGUgPSAoYXJncy5wb3AoKSB8fCAnJykucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKSxcbiAgICBpZ25vcmUgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09IG1pc3NpbmcgPyAoYXJncy5wb3AoKSkgOiBmYWxzZSxcbiAgICB3ID0gYXJncy5qb2luKCcnKTtcblxuICByZXR1cm4gKGlnbm9yZSA/ICcgIHRyeSB7XFxuJyA6ICcnKSArXG4gICAgJ19vdXRwdXQgKz0gX3N3aWcuY29tcGlsZUZpbGUoJyArIGZpbGUgKyAnLCB7JyArXG4gICAgJ3Jlc29sdmVGcm9tOiBcIicgKyBwYXJlbnRGaWxlICsgJ1wiJyArXG4gICAgJ30pKCcgK1xuICAgICgob25seUN0eCAmJiB3KSA/IHcgOiAoIXcgPyAnX2N0eCcgOiAnX3V0aWxzLmV4dGVuZCh7fSwgX2N0eCwgJyArIHcgKyAnKScpKSArXG4gICAgJyk7XFxuJyArXG4gICAgKGlnbm9yZSA/ICd9IGNhdGNoIChlKSB7fVxcbicgOiAnJyk7XG59O1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gKHN0ciwgbGluZSwgcGFyc2VyLCB0eXBlcywgc3RhY2ssIG9wdHMpIHtcbiAgdmFyIGZpbGUsIHc7XG4gIHBhcnNlci5vbih0eXBlcy5TVFJJTkcsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghZmlsZSkge1xuICAgICAgZmlsZSA9IHRva2VuLm1hdGNoO1xuICAgICAgdGhpcy5vdXQucHVzaChmaWxlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLlZBUiwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBmaWxlID0gdG9rZW4ubWF0Y2g7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIXcgJiYgdG9rZW4ubWF0Y2ggPT09ICd3aXRoJykge1xuICAgICAgdyA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHcgJiYgdG9rZW4ubWF0Y2ggPT09IG9ubHkgJiYgdGhpcy5wcmV2VG9rZW4ubWF0Y2ggIT09ICd3aXRoJykge1xuICAgICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRva2VuLm1hdGNoID09PSBpZ25vcmUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodG9rZW4ubWF0Y2ggPT09IG1pc3NpbmcpIHtcbiAgICAgIGlmICh0aGlzLnByZXZUb2tlbi5tYXRjaCAhPT0gaWdub3JlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB0b2tlbiBcIicgKyBtaXNzaW5nICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgICAgfVxuICAgICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucHJldlRva2VuLm1hdGNoID09PSBpZ25vcmUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgXCInICsgbWlzc2luZyArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJyBidXQgZm91bmQgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIuJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbignZW5kJywgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMub3V0LnB1c2gob3B0cy5maWxlbmFtZSB8fCBudWxsKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2luY2x1ZGUuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdGFnc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMuYXV0b2VzY2FwZSA9IHJlcXVpcmUoJy4vYXV0b2VzY2FwZScpO1xuZXhwb3J0cy5ibG9jayA9IHJlcXVpcmUoJy4vYmxvY2snKTtcbmV4cG9ydHNbXCJlbHNlXCJdID0gcmVxdWlyZSgnLi9lbHNlJyk7XG5leHBvcnRzLmVsc2VpZiA9IHJlcXVpcmUoJy4vZWxzZWlmJyk7XG5leHBvcnRzLmVsaWYgPSBleHBvcnRzLmVsc2VpZjtcbmV4cG9ydHNbXCJleHRlbmRzXCJdID0gcmVxdWlyZSgnLi9leHRlbmRzJyk7XG5leHBvcnRzLmZpbHRlciA9IHJlcXVpcmUoJy4vZmlsdGVyJyk7XG5leHBvcnRzW1wiZm9yXCJdID0gcmVxdWlyZSgnLi9mb3InKTtcbmV4cG9ydHNbXCJpZlwiXSA9IHJlcXVpcmUoJy4vaWYnKTtcbmV4cG9ydHNbXCJpbXBvcnRcIl0gPSByZXF1aXJlKCcuL2ltcG9ydCcpO1xuZXhwb3J0cy5pbmNsdWRlID0gcmVxdWlyZSgnLi9pbmNsdWRlJyk7XG5leHBvcnRzLm1hY3JvID0gcmVxdWlyZSgnLi9tYWNybycpO1xuZXhwb3J0cy5wYXJlbnQgPSByZXF1aXJlKCcuL3BhcmVudCcpO1xuZXhwb3J0cy5yYXcgPSByZXF1aXJlKCcuL3JhdycpO1xuZXhwb3J0cy5zZXQgPSByZXF1aXJlKCcuL3NldCcpO1xuZXhwb3J0cy5zcGFjZWxlc3MgPSByZXF1aXJlKCcuL3NwYWNlbGVzcycpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL2luZGV4LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIENyZWF0ZSBjdXN0b20sIHJldXNhYmxlIHNuaXBwZXRzIHdpdGhpbiB5b3VyIHRlbXBsYXRlcy5cbiAqIENhbiBiZSBpbXBvcnRlZCBmcm9tIG9uZSB0ZW1wbGF0ZSB0byBhbm90aGVyIHVzaW5nIHRoZSA8YSBocmVmPVwiI2ltcG9ydFwiPjxjb2RlIGRhdGEtbGFuZ3VhZ2U9XCJzd2lnXCI+eyUgaW1wb3J0IC4uLiAlfTwvY29kZT48L2E+IHRhZy5cbiAqXG4gKiBAYWxpYXMgbWFjcm9cbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgbWFjcm8gaW5wdXQodHlwZSwgbmFtZSwgaWQsIGxhYmVsLCB2YWx1ZSwgZXJyb3IpICV9XG4gKiAgIDxsYWJlbCBmb3I9XCJ7eyBuYW1lIH19XCI+e3sgbGFiZWwgfX08L2xhYmVsPlxuICogICA8aW5wdXQgdHlwZT1cInt7IHR5cGUgfX1cIiBuYW1lPVwie3sgbmFtZSB9fVwiIGlkPVwie3sgaWQgfX1cIiB2YWx1ZT1cInt7IHZhbHVlIH19XCJ7JSBpZiBlcnJvciAlfSBjbGFzcz1cImVycm9yXCJ7JSBlbmRpZiAlfT5cbiAqIHslIGVuZG1hY3JvICV9XG4gKlxuICoge3sgaW5wdXQoXCJ0ZXh0XCIsIFwiZm5hbWVcIiwgXCJmbmFtZVwiLCBcIkZpcnN0IE5hbWVcIiwgZm5hbWUudmFsdWUsIGZuYW1lLmVycm9ycykgfX1cbiAqIC8vID0+IDxsYWJlbCBmb3I9XCJmbmFtZVwiPkZpcnN0IE5hbWU8L2xhYmVsPlxuICogLy8gICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgbmFtZT1cImZuYW1lXCIgaWQ9XCJmbmFtZVwiIHZhbHVlPVwiXCI+XG4gKlxuICogQHBhcmFtIHsuLi5hcmd1bWVudHN9IGFyZ3VtZW50cyAgVXNlci1kZWZpbmVkIGFyZ3VtZW50cy5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgdmFyIGZuTmFtZSA9IGFyZ3Muc2hpZnQoKTtcblxuICByZXR1cm4gJ19jdHguJyArIGZuTmFtZSArICcgPSBmdW5jdGlvbiAoJyArIGFyZ3Muam9pbignJykgKyAnKSB7XFxuJyArXG4gICAgJyAgdmFyIF9vdXRwdXQgPSBcIlwiO1xcbicgK1xuICAgIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSkgKyAnXFxuJyArXG4gICAgJyAgcmV0dXJuIF9vdXRwdXQ7XFxuJyArXG4gICAgJ307XFxuJyArXG4gICAgJ19jdHguJyArIGZuTmFtZSArICcuc2FmZSA9IHRydWU7XFxuJztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzKSB7XG4gIHZhciBuYW1lO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICh0b2tlbi5tYXRjaC5pbmRleE9mKCcuJykgIT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZG90IGluIG1hY3JvIGFyZ3VtZW50IFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICAgIH1cbiAgICB0aGlzLm91dC5wdXNoKHRva2VuLm1hdGNoKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkZVTkNUSU9OLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIW5hbWUpIHtcbiAgICAgIG5hbWUgPSB0b2tlbi5tYXRjaDtcbiAgICAgIHRoaXMub3V0LnB1c2gobmFtZSk7XG4gICAgICB0aGlzLnN0YXRlLnB1c2godHlwZXMuRlVOQ1RJT04pO1xuICAgIH1cbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkZVTkNUSU9ORU1QVFksIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghbmFtZSkge1xuICAgICAgbmFtZSA9IHRva2VuLm1hdGNoO1xuICAgICAgdGhpcy5vdXQucHVzaChuYW1lKTtcbiAgICB9XG4gIH0pO1xuXG4gIHBhcnNlci5vbih0eXBlcy5QQVJFTkNMT1NFLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaXNMYXN0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBwYXJlbnRoZXNpcyBjbG9zZSBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkNPTU1BLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm47XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5lbmRzID0gdHJ1ZTtcbmV4cG9ydHMuYmxvY2sgPSB0cnVlO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL21hY3JvLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIEluamVjdCB0aGUgY29udGVudCBmcm9tIHRoZSBwYXJlbnQgdGVtcGxhdGUncyBibG9jayBvZiB0aGUgc2FtZSBuYW1lIGludG8gdGhlIGN1cnJlbnQgYmxvY2suXG4gKlxuICogU2VlIDxhIGhyZWY9XCIjaW5oZXJpdGFuY2VcIj5UZW1wbGF0ZSBJbmhlcml0YW5jZTwvYT4gZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gKlxuICogQGFsaWFzIHBhcmVudFxuICpcbiAqIEBleGFtcGxlXG4gKiB7JSBleHRlbmRzIFwiLi9mb28uaHRtbFwiICV9XG4gKiB7JSBibG9jayBjb250ZW50ICV9XG4gKiAgIE15IGNvbnRlbnQuXG4gKiAgIHslIHBhcmVudCAlfVxuICogeyUgZW5kYmxvY2sgJX1cbiAqXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIGlmICghcGFyZW50cyB8fCAhcGFyZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cblxuICB2YXIgcGFyZW50RmlsZSA9IGFyZ3NbMF0sXG4gICAgYnJlYWtlciA9IHRydWUsXG4gICAgbCA9IHBhcmVudHMubGVuZ3RoLFxuICAgIGkgPSAwLFxuICAgIHBhcmVudCxcbiAgICBibG9jaztcblxuICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICBwYXJlbnQgPSBwYXJlbnRzW2ldO1xuICAgIGlmICghcGFyZW50LmJsb2NrcyB8fCAhcGFyZW50LmJsb2Nrcy5oYXNPd25Qcm9wZXJ0eShibG9ja05hbWUpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gU2lsbHkgSlNMaW50IFwiU3RyYW5nZSBMb29wXCIgcmVxdWlyZXMgcmV0dXJuIHRvIGJlIGluIGEgY29uZGl0aW9uYWxcbiAgICBpZiAoYnJlYWtlciAmJiBwYXJlbnRGaWxlICE9PSBwYXJlbnQubmFtZSkge1xuICAgICAgYmxvY2sgPSBwYXJlbnQuYmxvY2tzW2Jsb2NrTmFtZV07XG4gICAgICByZXR1cm4gYmxvY2suY29tcGlsZShjb21waWxlciwgW2Jsb2NrTmFtZV0sIGJsb2NrLmNvbnRlbnQsIHBhcmVudHMuc2xpY2UoaSArIDEpLCBvcHRpb25zKSArICdcXG4nO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlciwgdHlwZXMsIHN0YWNrLCBvcHRzKSB7XG4gIHBhcnNlci5vbignKicsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBhcmd1bWVudCBcIicgKyB0b2tlbi5tYXRjaCArICdcIiBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKCdlbmQnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5vdXQucHVzaChvcHRzLmZpbGVuYW1lKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzL3BhcmVudC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9zd2lnL2xpYi90YWdzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLy8gTWFnaWMgdGFnLCBoYXJkY29kZWQgaW50byBwYXJzZXJcblxuLyoqXG4gKiBGb3JjZXMgdGhlIGNvbnRlbnQgdG8gbm90IGJlIGF1dG8tZXNjYXBlZC4gQWxsIHN3aWcgaW5zdHJ1Y3Rpb25zIHdpbGwgYmUgaWdub3JlZCBhbmQgdGhlIGNvbnRlbnQgd2lsbCBiZSByZW5kZXJlZCBleGFjdGx5IGFzIGl0IHdhcyBnaXZlbi5cbiAqXG4gKiBAYWxpYXMgcmF3XG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGZvb2JhciA9ICc8cD4nXG4gKiB7JSByYXcgJX17eyBmb29iYXIgfX17JSBlbmRyYXcgJX1cbiAqIC8vID0+IHt7IGZvb2JhciB9fVxuICpcbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzLCBjb250ZW50LCBwYXJlbnRzLCBvcHRpb25zLCBibG9ja05hbWUpIHtcbiAgcmV0dXJuIGNvbXBpbGVyKGNvbnRlbnQsIHBhcmVudHMsIG9wdGlvbnMsIGJsb2NrTmFtZSk7XG59O1xuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzdHIsIGxpbmUsIHBhcnNlcikge1xuICBwYXJzZXIub24oJyonLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdG9rZW4gXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgaW4gcmF3IHRhZyBvbiBsaW5lICcgKyBsaW5lICsgJy4nKTtcbiAgfSk7XG4gIHJldHVybiB0cnVlO1xufTtcbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3MvcmF3LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIFNldCBhIHZhcmlhYmxlIGZvciByZS11c2UgaW4gdGhlIGN1cnJlbnQgY29udGV4dC4gVGhpcyB3aWxsIG92ZXItd3JpdGUgYW55IHZhbHVlIGFscmVhZHkgc2V0IHRvIHRoZSBjb250ZXh0IGZvciB0aGUgZ2l2ZW4gPHZhcj52YXJuYW1lPC92YXI+LlxuICpcbiAqIEBhbGlhcyBzZXRcbiAqXG4gKiBAZXhhbXBsZVxuICogeyUgc2V0IGZvbyA9IFwiYW55dGhpbmchXCIgJX1cbiAqIHt7IGZvbyB9fVxuICogLy8gPT4gYW55dGhpbmchXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIGluZGV4ID0gMjtcbiAqIHslIHNldCBiYXIgPSAxICV9XG4gKiB7JSBzZXQgYmFyICs9IGluZGV4fGRlZmF1bHQoMykgJX1cbiAqIC8vID0+IDNcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gZm9vZHMgPSB7fTtcbiAqIC8vIGZvb2QgPSAnY2hpbGknO1xuICogeyUgc2V0IGZvb2RzW2Zvb2RdID0gXCJjb24gcXVlc29cIiAlfVxuICoge3sgZm9vZHMuY2hpbGkgfX1cbiAqIC8vID0+IGNvbiBxdWVzb1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBmb29kcyA9IHsgY2hpbGk6ICdjaGlsaSBjb24gcXVlc28nIH1cbiAqIHslIHNldCBmb29kcy5jaGlsaSA9IFwiZ3VhdGFtYWxhbiBpbnNhbml0eSBwZXBwZXJcIiAlfVxuICoge3sgZm9vZHMuY2hpbGkgfX1cbiAqIC8vID0+IGd1YXRhbWFsYW4gaW5zYW5pdHkgcGVwcGVyXG4gKlxuICogQHBhcmFtIHtsaXRlcmFsfSB2YXJuYW1lICAgVGhlIHZhcmlhYmxlIG5hbWUgdG8gYXNzaWduIHRoZSB2YWx1ZSB0by5cbiAqIEBwYXJhbSB7bGl0ZXJhbH0gYXNzaWduZW1lbnQgICBBbnkgdmFsaWQgSmF2YVNjcmlwdCBhc3NpZ25lbWVudC4gPGNvZGUgZGF0YS1sYW5ndWFnZT1cImpzXCI+PSwgKz0sICo9LCAvPSwgLT08L2NvZGU+XG4gKiBAcGFyYW0geyp9ICAgdmFsdWUgICAgIFZhbGlkIHZhcmlhYmxlIG91dHB1dC5cbiAqL1xuZXhwb3J0cy5jb21waWxlID0gZnVuY3Rpb24gKGNvbXBpbGVyLCBhcmdzKSB7XG4gIHJldHVybiBhcmdzLmpvaW4oJyAnKSArICc7XFxuJztcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIsIHR5cGVzKSB7XG4gIHZhciBuYW1lU2V0ID0gJycsXG4gICAgcHJvcGVydHlOYW1lO1xuXG4gIHBhcnNlci5vbih0eXBlcy5WQVIsIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmIChwcm9wZXJ0eU5hbWUpIHtcbiAgICAgIC8vIFRlbGwgdGhlIHBhcnNlciB3aGVyZSB0byBmaW5kIHRoZSB2YXJpYWJsZVxuICAgICAgcHJvcGVydHlOYW1lICs9ICdfY3R4LicgKyB0b2tlbi5tYXRjaDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlci5vdXQubGVuZ3RoKSB7XG4gICAgICBuYW1lU2V0ICs9IHRva2VuLm1hdGNoO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQlJBQ0tFVE9QRU4sIGZ1bmN0aW9uICh0b2tlbikge1xuICAgIGlmICghcHJvcGVydHlOYW1lICYmICF0aGlzLm91dC5sZW5ndGgpIHtcbiAgICAgIHByb3BlcnR5TmFtZSA9IHRva2VuLm1hdGNoO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuU1RSSU5HLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAocHJvcGVydHlOYW1lICYmICF0aGlzLm91dC5sZW5ndGgpIHtcbiAgICAgIHByb3BlcnR5TmFtZSArPSB0b2tlbi5tYXRjaDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcGFyc2VyLm9uKHR5cGVzLkJSQUNLRVRDTE9TRSwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHByb3BlcnR5TmFtZSAmJiAhdGhpcy5vdXQubGVuZ3RoKSB7XG4gICAgICBuYW1lU2V0ICs9IHByb3BlcnR5TmFtZSArIHRva2VuLm1hdGNoO1xuICAgICAgcHJvcGVydHlOYW1lID0gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuRE9US0VZLCBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICBpZiAoIXByb3BlcnR5TmFtZSAmJiAhbmFtZVNldCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIG5hbWVTZXQgKz0gJy4nICsgdG9rZW4ubWF0Y2g7XG4gICAgcmV0dXJuO1xuICB9KTtcblxuICBwYXJzZXIub24odHlwZXMuQVNTSUdOTUVOVCwgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgaWYgKHRoaXMub3V0Lmxlbmd0aCB8fCAhbmFtZVNldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGFzc2lnbm1lbnQgXCInICsgdG9rZW4ubWF0Y2ggKyAnXCIgb24gbGluZSAnICsgbGluZSArICcuJyk7XG4gICAgfVxuXG4gICAgdGhpcy5vdXQucHVzaChcbiAgICAgIC8vIFByZXZlbnQgdGhlIHNldCBmcm9tIHNwaWxsaW5nIGludG8gZ2xvYmFsIHNjb3BlXG4gICAgICAnX2N0eC4nICsgbmFtZVNldFxuICAgICk7XG4gICAgdGhpcy5vdXQucHVzaCh0b2tlbi5tYXRjaCk7XG4gIH0pO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5ibG9jayA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3Mvc2V0LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEF0dGVtcHRzIHRvIHJlbW92ZSB3aGl0ZXNwYWNlIGJldHdlZW4gSFRNTCB0YWdzLiBVc2UgYXQgeW91ciBvd24gcmlzay5cbiAqXG4gKiBAYWxpYXMgc3BhY2VsZXNzXG4gKlxuICogQGV4YW1wbGVcbiAqIHslIHNwYWNlbGVzcyAlfVxuICogICB7JSBmb3IgbnVtIGluIGZvbyAlfVxuICogICA8bGk+e3sgbG9vcC5pbmRleCB9fTwvbGk+XG4gKiAgIHslIGVuZGZvciAlfVxuICogeyUgZW5kc3BhY2VsZXNzICV9XG4gKiAvLyA9PiA8bGk+MTwvbGk+PGxpPjI8L2xpPjxsaT4zPC9saT5cbiAqXG4gKi9cbmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChjb21waWxlciwgYXJncywgY29udGVudCwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKSB7XG4gIGZ1bmN0aW9uIHN0cmlwV2hpdGVzcGFjZSh0b2tlbnMpIHtcbiAgICByZXR1cm4gdXRpbHMubWFwKHRva2VucywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICBpZiAodG9rZW4uY29udGVudCB8fCB0eXBlb2YgdG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRva2VuLmNvbnRlbnQgPSBzdHJpcFdoaXRlc3BhY2UodG9rZW4uY29udGVudCk7XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRva2VuLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAgIC5yZXBsYWNlKC8+XFxzKzwvZywgJz48JylcbiAgICAgICAgLnJlcGxhY2UoL1xccyskLywgJycpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGNvbXBpbGVyKHN0cmlwV2hpdGVzcGFjZShjb250ZW50KSwgcGFyZW50cywgb3B0aW9ucywgYmxvY2tOYW1lKTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc3RyLCBsaW5lLCBwYXJzZXIpIHtcbiAgcGFyc2VyLm9uKCcqJywgZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHRva2VuIFwiJyArIHRva2VuLm1hdGNoICsgJ1wiIG9uIGxpbmUgJyArIGxpbmUgKyAnLicpO1xuICB9KTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZW5kcyA9IHRydWU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3Mvc3BhY2VsZXNzLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3N3aWcvbGliL3RhZ3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgaXNBcnJheTtcblxuLyoqXG4gKiBTdHJpcCBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlIGZyb20gYSBzdHJpbmcuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGlucHV0XG4gKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgIFN0cmlwcGVkIGlucHV0LlxuICovXG5leHBvcnRzLnN0cmlwID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XG59O1xuXG4vKipcbiAqIFRlc3QgaWYgYSBzdHJpbmcgc3RhcnRzIHdpdGggYSBnaXZlbiBwcmVmaXguXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN0ciAgICBTdHJpbmcgdG8gdGVzdCBhZ2FpbnN0LlxuICogQHBhcmFtICB7c3RyaW5nfSBwcmVmaXggUHJlZml4IHRvIGNoZWNrIGZvci5cbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydHMuc3RhcnRzV2l0aCA9IGZ1bmN0aW9uIChzdHIsIHByZWZpeCkge1xuICByZXR1cm4gc3RyLmluZGV4T2YocHJlZml4KSA9PT0gMDtcbn07XG5cbi8qKlxuICogVGVzdCBpZiBhIHN0cmluZyBlbmRzIHdpdGggYSBnaXZlbiBzdWZmaXguXG4gKiBAcGFyYW0gIHtzdHJpbmd9IHN0ciAgICBTdHJpbmcgdG8gdGVzdCBhZ2FpbnN0LlxuICogQHBhcmFtICB7c3RyaW5nfSBzdWZmaXggU3VmZml4IHRvIGNoZWNrIGZvci5cbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydHMuZW5kc1dpdGggPSBmdW5jdGlvbiAoc3RyLCBzdWZmaXgpIHtcbiAgcmV0dXJuIHN0ci5pbmRleE9mKHN1ZmZpeCwgc3RyLmxlbmd0aCAtIHN1ZmZpeC5sZW5ndGgpICE9PSAtMTtcbn07XG5cbi8qKlxuICogSXRlcmF0ZSBvdmVyIGFuIGFycmF5IG9yIG9iamVjdC5cbiAqIEBwYXJhbSAge2FycmF5fG9iamVjdH0gb2JqIEVudW1lcmFibGUgb2JqZWN0LlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgQ2FsbGJhY2sgZnVuY3Rpb24gZXhlY3V0ZWQgZm9yIGVhY2ggaXRlbS5cbiAqIEByZXR1cm4ge2FycmF5fG9iamVjdH0gICAgIFRoZSBvcmlnaW5hbCBpbnB1dCBvYmplY3QuXG4gKi9cbmV4cG9ydHMuZWFjaCA9IGZ1bmN0aW9uIChvYmosIGZuKSB7XG4gIHZhciBpLCBsO1xuXG4gIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICBpID0gMDtcbiAgICBsID0gb2JqLmxlbmd0aDtcbiAgICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICAgIGlmIChmbihvYmpbaV0sIGksIG9iaikgPT09IGZhbHNlKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGkpKSB7XG4gICAgICAgIGlmIChmbihvYmpbaV0sIGksIG9iaikgPT09IGZhbHNlKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxuLyoqXG4gKiBUZXN0IGlmIGFuIG9iamVjdCBpcyBhbiBBcnJheS5cbiAqIEBwYXJhbSB7b2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXkgPSAoQXJyYXkuaGFzT3duUHJvcGVydHkoJ2lzQXJyYXknKSkgPyBBcnJheS5pc0FycmF5IDogZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gKG9iaikgPyAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikuaW5kZXhPZigpICE9PSAtMSkgOiBmYWxzZTtcbn07XG5cbi8qKlxuICogVGVzdCBpZiBhbiBpdGVtIGluIGFuIGVudW1lcmFibGUgbWF0Y2hlcyB5b3VyIGNvbmRpdGlvbnMuXG4gKiBAcGFyYW0gIHthcnJheXxvYmplY3R9ICAgb2JqICAgRW51bWVyYWJsZSBvYmplY3QuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgICAgZm4gICAgRXhlY3V0ZWQgZm9yIGVhY2ggaXRlbS4gUmV0dXJuIHRydWUgaWYgeW91ciBjb25kaXRpb24gaXMgbWV0LlxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0cy5zb21lID0gZnVuY3Rpb24gKG9iaiwgZm4pIHtcbiAgdmFyIGkgPSAwLFxuICAgIHJlc3VsdCxcbiAgICBsO1xuICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgbCA9IG9iai5sZW5ndGg7XG5cbiAgICBmb3IgKGk7IGkgPCBsOyBpICs9IDEpIHtcbiAgICAgIHJlc3VsdCA9IGZuKG9ialtpXSwgaSwgb2JqKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGV4cG9ydHMuZWFjaChvYmosIGZ1bmN0aW9uICh2YWx1ZSwgaW5kZXgpIHtcbiAgICAgIHJlc3VsdCA9IGZuKHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgIHJldHVybiAhKHJlc3VsdCk7XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuICEhcmVzdWx0O1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSBuZXcgZW51bWVyYWJsZSwgbWFwcGVkIGJ5IGEgZ2l2ZW4gaXRlcmF0aW9uIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7b2JqZWN0fSAgIG9iaiBFbnVtZXJhYmxlIG9iamVjdC5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgRXhlY3V0ZWQgZm9yIGVhY2ggaXRlbS4gUmV0dXJuIHRoZSBpdGVtIHRvIHJlcGxhY2UgdGhlIG9yaWdpbmFsIGl0ZW0gd2l0aC5cbiAqIEByZXR1cm4ge29iamVjdH0gICAgICAgTmV3IG1hcHBlZCBvYmplY3QuXG4gKi9cbmV4cG9ydHMubWFwID0gZnVuY3Rpb24gKG9iaiwgZm4pIHtcbiAgdmFyIGkgPSAwLFxuICAgIHJlc3VsdCA9IFtdLFxuICAgIGw7XG5cbiAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgIGwgPSBvYmoubGVuZ3RoO1xuICAgIGZvciAoaTsgaSA8IGw7IGkgKz0gMSkge1xuICAgICAgcmVzdWx0W2ldID0gZm4ob2JqW2ldLCBpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgICByZXN1bHRbaV0gPSBmbihvYmpbaV0sIGkpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBDb3B5IGFsbCBvZiB0aGUgcHJvcGVydGllcyBpbiB0aGUgc291cmNlIG9iamVjdHMgb3ZlciB0byB0aGUgZGVzdGluYXRpb24gb2JqZWN0LCBhbmQgcmV0dXJuIHRoZSBkZXN0aW5hdGlvbiBvYmplY3QuIEl0J3MgaW4tb3JkZXIsIHNvIHRoZSBsYXN0IHNvdXJjZSB3aWxsIG92ZXJyaWRlIHByb3BlcnRpZXMgb2YgdGhlIHNhbWUgbmFtZSBpbiBwcmV2aW91cyBhcmd1bWVudHMuXG4gKiBAcGFyYW0gey4uLm9iamVjdH0gYXJndW1lbnRzXG4gKiBAcmV0dXJuIHtvYmplY3R9XG4gKi9cbmV4cG9ydHMuZXh0ZW5kID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cyxcbiAgICB0YXJnZXQgPSBhcmdzWzBdLFxuICAgIG9ianMgPSAoYXJncy5sZW5ndGggPiAxKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3MsIDEpIDogW10sXG4gICAgaSA9IDAsXG4gICAgbCA9IG9ianMubGVuZ3RoLFxuICAgIGtleSxcbiAgICBvYmo7XG5cbiAgZm9yIChpOyBpIDwgbDsgaSArPSAxKSB7XG4gICAgb2JqID0gb2Jqc1tpXSB8fCB7fTtcbiAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB0YXJnZXRba2V5XSA9IG9ialtrZXldO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0O1xufTtcblxuLyoqXG4gKiBHZXQgYWxsIG9mIHRoZSBrZXlzIG9uIGFuIG9iamVjdC5cbiAqIEBwYXJhbSAge29iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHthcnJheX1cbiAqL1xuZXhwb3J0cy5rZXlzID0gZnVuY3Rpb24gKG9iaikge1xuICBpZiAoIW9iaikge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cykge1xuICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopO1xuICB9XG5cbiAgcmV0dXJuIGV4cG9ydHMubWFwKG9iaiwgZnVuY3Rpb24gKHYsIGspIHtcbiAgICByZXR1cm4gaztcbiAgfSk7XG59O1xuXG4vKipcbiAqIFRocm93IGFuIGVycm9yIHdpdGggcG9zc2libGUgbGluZSBudW1iZXIgYW5kIHNvdXJjZSBmaWxlLlxuICogQHBhcmFtICB7c3RyaW5nfSBtZXNzYWdlIEVycm9yIG1lc3NhZ2VcbiAqIEBwYXJhbSAge251bWJlcn0gW2xpbmVdICBMaW5lIG51bWJlciBpbiB0ZW1wbGF0ZS5cbiAqIEBwYXJhbSAge3N0cmluZ30gW2ZpbGVdICBUZW1wbGF0ZSBmaWxlIHRoZSBlcnJvciBvY2N1cmVkIGluLlxuICogQHRocm93cyB7RXJyb3J9IE5vIHNlcmlvdXNseSwgdGhlIHBvaW50IGlzIHRvIHRocm93IGFuIGVycm9yLlxuICovXG5leHBvcnRzLnRocm93RXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgbGluZSwgZmlsZSkge1xuICBpZiAobGluZSkge1xuICAgIG1lc3NhZ2UgKz0gJyBvbiBsaW5lICcgKyBsaW5lO1xuICB9XG4gIGlmIChmaWxlKSB7XG4gICAgbWVzc2FnZSArPSAnIGluIGZpbGUgJyArIGZpbGU7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgKyAnLicpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWIvdXRpbHMuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvc3dpZy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG53aW5kb3cub25sb2FkID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNpdGUgPSB7XG4gICAgaW5pdCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG4gICAgICB2YXIgbWljcm9BamF4ID0gcmVxdWlyZSgnLi9taWNyb2FqYXgnKTtcbiAgICAgIHZhciBwdWJzdWIgPSByZXF1aXJlKCcuL3B1YnN1YicpO1xuICAgICAgdmFyIHN3aWcgID0gcmVxdWlyZSgnc3dpZycpO1xuICAgICAgdmFyIGFwcCA9IHtcbiAgICAgICAgJ2hlbHAnIDogaGVscGVycyxcbiAgICAgICAgJ2FqYXgnIDogbWljcm9BamF4LFxuICAgICAgICAncHVibGlzaCcgOiBwdWJzdWIucHVibGlzaCxcbiAgICAgICAgJ3N1YnNjcmliZScgOiBwdWJzdWIuc3Vic2NyaWJlLFxuICAgICAgICAndW5zdWJzY3JpYmUnIDogcHVic3ViLnVuc3Vic2NyaWJlLFxuICAgICAgICAncmVuZGVyJyA6IHN3aWcucnVuLFxuICAgICAgICAncHJlY29tcGlsZScgOiBzd2lnLnByZWNvbXBpbGVcbiAgICAgIH0sXG4gICAgICBkb20gPSB7XG4gICAgICAgICdvdmVybGF5Q2xvc2UnIDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXJsYXktY2xvc2UnKSxcbiAgICAgICAgJ292ZXJsYXlDb250ZW50JyA6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdmVybGF5LWNvbnRlbnQnKVxuICAgICAgfTtcbiAgICAgIHNpdGUuZGVmZXJlZChhcHAsIGRvbSk7XG4gICAgICBzaXRlLmV2ZW50cyhhcHAsIGRvbSk7XG4gICAgfSxcbiAgICBldmVudHMgOiBmdW5jdGlvbiAoYXBwLCBkb20pIHtcblxuICAgICAgYXBwLmhlbHAuYWRkRXZlbnRMaXN0ZW5lckJ5Q2xhc3MoJ292ZXJsYXktdHJpZ2dlcicsICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGFwcC5wdWJsaXNoKCcvZXZlbnQvcmVnaXN0ZXIvc3VibWl0JywgdHJ1ZSk7XG4gICAgICAgIGFwcC5hamF4KHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyAnL2ZyYWdtZW50cy9yZWdpc3RlcicsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICBhcHAucHVibGlzaCgnL3ZpZXcvcmVnaXN0ZXIvbG9hZGVkJywgdHJ1ZSk7XG4gICAgICAgICAgZG9tLm92ZXJsYXlDb250ZW50LmlubmVySFRNTCA9IHJlcztcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgYXBwLmhlbHAuYWRkRXZlbnRMaXN0ZW5lckJ5Q2xhc3MoJ3NpZ25pbi1idG4nLCAnY2xpY2snLCBmdW5jdGlvbihlKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBhcHAuaGVscC5hZGRCb2R5Q2xhc3MoJ292ZXJsYXktdmlzaWJsZScpO1xuICAgICAgICBhcHAuYWpheCh3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgJy9mcmFnbWVudHMvc2lnbmluJywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgIGFwcC5wdWJsaXNoKCcvdmlldy9zaWduaW4vbG9hZGVkJywgdHJ1ZSk7XG4gICAgICAgICAgZG9tLm92ZXJsYXlDb250ZW50LmlubmVySFRNTCA9IHJlcztcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgaWYoZG9tLm92ZXJsYXlDbG9zZSl7XG4gICAgICAgIGRvbS5vdmVybGF5Q2xvc2UuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbigpe1xuICAgICAgICAgIGFwcC5oZWxwLnJlbW92ZUJvZHlDbGFzcygnb3ZlcmxheS12aXNpYmxlJyk7XG4gICAgICAgICAgYXBwLnB1Ymxpc2goJy92aWV3L292ZXJsYXkvY2xvc2VkJywgdHJ1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBhcHAuc3Vic2NyaWJlKFwiL3ZpZXcvcmVnaXN0ZXIvbG9hZGVkXCIsIGZ1bmN0aW9uKGZsYWcpe1xuICAgICAgICAgIGlmKGZsYWcgPT09IHRydWUpe1xuICAgICAgICAgICAgc2l0ZS5wb3N0U2lnbnVwKGFwcCk7XG4gICAgICAgICAgICBhcHAuaGVscC5hZGRFdmVudExpc3RlbmVyQnlDbGFzcygnaGVscCcsICdjbGljaycsIGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgICBhcHAuaGVscC5zaG93VG9vbHRpcChlLCAnaGVscC1tZXNzYWdlJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgYXBwLnN1YnNjcmliZShcIi92aWV3L29yZGVyXCIsIGZ1bmN0aW9uKGZsYWcpe1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCd3cmFwJylbMF0uaW5uZXJIVE1MID0gXCJcIjtcbiAgICAgICAgYXBwLmFqYXgod2luZG93LmxvY2F0aW9uLm9yaWdpbiArICcvZnJhZ21lbnRzL29yZGVyJywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgIGFwcC5wdWJsaXNoKCcvdmlldy9vcmRlci9sb2FkZWQnLCB0cnVlKTtcbiAgICAgICAgICBkb20ub3ZlcmxheUNvbnRlbnQuaW5uZXJIVE1MID0gcmVzO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBhcHAuc3Vic2NyaWJlKFwiL3ZpZXcvb3JkZXIvbG9hZGVkXCIsIGZ1bmN0aW9uKGZsYWcpe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBhcHAuaGVscC5yZW1vdmVCb2R5Q2xhc3MoJ2hvbWUnKTtcbiAgICAgICAgICBhcHAuaGVscC5hZGRCb2R5Q2xhc3MoJ29yZGVyJyk7XG4gICAgICAgIH0sIDEwMDApO1xuICAgICAgICBhcHAuaGVscC5hZGRFdmVudExpc3RlbmVyQnlDbGFzcygncGFja2FnZS10eXBlJywgJ2NsaWNrJywgZnVuY3Rpb24oZSl7XG4gICAgICAgICAgdmFyIHRhcmdldCA9IGUuY3VycmVudFRhcmdldDtcbiAgICAgICAgICB2YXIgc2libGluZ3MgPSB0YXJnZXQucGFyZW50Tm9kZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdwYWNrYWdlLXR5cGUnKTtcbiAgICAgICAgICB2YXIgZm9ybWJ0biA9IHRhcmdldC5wYXJlbnROb2RlLnBhcmVudE5vZGUucGFyZW50Tm9kZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdwYWNrYWdlLXR5cGUtYnRuJylbMF07XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaWJsaW5ncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXBwLmhlbHAucmVtb3ZlQ2xhc3Moc2libGluZ3NbaV0sJ2FjdGl2ZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXQuY2xhc3NOYW1lICs9ICcgYWN0aXZlJztcbiAgICAgICAgICBhcHAuaGVscC5yZW1vdmVDbGFzcyhmb3JtYnRuLCAnZGlzYWJsZWQnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYXBwLmhlbHAuYWRkRXZlbnRMaXN0ZW5lckJ5Q2xhc3MoJ2Rpc2FibGVkJywgJ2NsaWNrJywgZnVuY3Rpb24oZSl7XG4gICAgICAgICAgaWYoIGUuY3VycmVudFRhcmdldC5jbGFzc05hbWUuaW5kZXhPZihcImRpc2FibGVkXCIpID4gLTEpe1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGFwcC5zdWJzY3JpYmUoXCIvZm9ybS9yZWdpc3Rlci91cGRhdGVcIiwgZnVuY3Rpb24oZmxhZyl7XG4gICAgICAgICAgdmFyIGJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtYWNjb3VudC1idXR0b24nKTtcbiAgICAgICAgICBpZihmbGFnID09ICdzdWNjZXNzJyl7XG4gICAgICAgICAgICBhcHAuaGVscC5hZGRCb2R5Q2xhc3MoJ2xvYWRpbmctc3VjY2VzcycpO1xuICAgICAgICAgICAgYXBwLmhlbHAubG9hZGluZyhidXR0b24sICdzdWNjZXNzJyk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgYXBwLnB1Ymxpc2goJy92aWV3L29yZGVyJywgdHJ1ZSk7XG4gICAgICAgICAgICB9LCAyMDAwKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXBwLmhlbHAubG9hZGluZyhidXR0b24sICdyZW1vdmUnKTtcbiAgICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgYXBwLnN1YnNjcmliZShcIi9ldmVudC9yZWdpc3Rlci9zdWJtaXRcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgYXBwLmhlbHAuYWRkQm9keUNsYXNzKCdvdmVybGF5LXZpc2libGUnKTtcbiAgICAgIH0pO1xuXG4gICAgICBhcHAuc3Vic2NyaWJlKFwiL21lc3NhZ2UvZXJyb3JcIiwgZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3Itd3JhcFwiKS5pbm5lckhUTUwgKz0gZGF0YS5odG1sO1xuICAgICAgfSlcbiAgICB9LFxuICAgIGRlZmVyZWQgOiBmdW5jdGlvbihhcHAsIGRvbSl7XG4gICAgICBpZihkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYm9keScpWzBdLmNsYXNzTmFtZS5pbmRleE9mKCdvcmRlcicpID4gLTEpe1xuICAgICAgICBhcHAuYWpheCh3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgJy9mcmFnbWVudHMvb3JkZXInLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgYXBwLnB1Ymxpc2goJy92aWV3L29yZGVyL2xvYWRlZCcsIHRydWUpO1xuICAgICAgICAgIGRvbS5vdmVybGF5Q29udGVudC5pbm5lckhUTUwgPSByZXM7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgcG9zdFNpZ251cCA6IGZ1bmN0aW9uKGFwcCl7XG4gICAgICB2YXIgc3VibWl0YWNjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtYWNjb3VudC1idXR0b24nKTtcbiAgICAgIHN1Ym1pdGFjY3QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbihlKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBhcHAuaGVscC5sb2FkaW5nKHN1Ym1pdGFjY3QpO1xuICAgICAgICB2YXIgc2lnbnVwRm9ybUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaWdudXBcIik7XG4gICAgICAgIHZhciBmb3JtRGF0YSA9IG5ldyBGb3JtRGF0YShzaWdudXBGb3JtRWwpO1xuICAgICAgICBhcHAuaGVscC5wb3N0Rm9ybShzaWdudXBGb3JtRWwsIGZ1bmN0aW9uKHhocil7XG4gICAgICAgICAgYXBwLmhlbHAucmVtb3ZlRWxlbWVudHNCeUNsYXNzKCdlcnJvcicpO1xuXG4gICAgICAgICAgdmFyIHJlcyA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgICBpZihyZXMuZXJyb3JzKXtcbiAgICAgICAgICAgIHZhciB0cGwgPSBhcHAucHJlY29tcGlsZSgneyUgZm9yIGVycm9yIGluIGVycm9ycyB8cmV2ZXJzZSAlfTxkaXYgY2xhc3M9XCJlcnJvclwiPnt7IGVycm9yIH19PC9kaXY+eyUgZW5kZm9yICV9JykudHBsXG4gICAgICAgICAgICB2YXIgdGVtcGxhdGUgPSBhcHAucmVuZGVyKHRwbCwgeyAnZXJyb3JzJyA6IHJlcy5lcnJvcnMgfSk7XG4gICAgICAgICAgICBhcHAucHVibGlzaCgnL2Zvcm0vcmVnaXN0ZXIvdXBkYXRlJywgJ2ZhaWwnKTtcbiAgICAgICAgICAgIGFwcC5wdWJsaXNoKCcvbWVzc2FnZS9lcnJvcicsIHsgaHRtbCA6IHRlbXBsYXRlIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGhpc3RvcnkucHVzaFN0YXRlKCdvcmRlcicsICdvcmRlcicsICcvb3JkZXInKTtcbiAgICAgICAgICAgIGFwcC5oZWxwLnNldENvb2tpZSgna2V5JywgcmVzLmtleSwgJzEnKTtcbiAgICAgICAgICAgIGFwcC5wdWJsaXNoKCcvZm9ybS9yZWdpc3Rlci91cGRhdGUnLCAnc3VjY2VzcycpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzaXRlLmluaXQoKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZmFrZV80ZjI3YmZkNy5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblxudmFyIGhlbHBlcnMgPSB7XG4gIGFkZEV2ZW50TGlzdGVuZXJCeUNsYXNzIDogZnVuY3Rpb24gKGNsYXNzTmFtZSwgZXZlbnQsIGZuKSB7XG4gICAgdmFyIGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKGNsYXNzTmFtZSk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGxpc3RbaV0uYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgZm4sIGZhbHNlKTtcbiAgICB9XG4gIH0sXG4gIGFkZEJvZHlDbGFzcyA6IGZ1bmN0aW9uIChjKSB7XG4gICAgaWYoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXS5jbGFzc05hbWUuaW5kZXhPZihjKSA9PSAtMSl7XG4gICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXS5jbGFzc05hbWUgKz0nICcrYztcbiAgICB9XG4gIH0sXG4gIHJlbW92ZUJvZHlDbGFzcyA6IGZ1bmN0aW9uIChjKSB7XG4gICAgaGVscGVycy5yZW1vdmVDbGFzcyhkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYm9keScpWzBdLCBjKTtcbiAgfSxcbiAgcmVtb3ZlQ2xhc3MgOiBmdW5jdGlvbiAoZWwsIGNsYXNzTmFtZSkge1xuICAgIGlmIChlbC5jbGFzc0xpc3Qpe1xuICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZShjbGFzc05hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWUucmVwbGFjZShuZXcgUmVnRXhwKCcoXnxcXFxcYiknICsgY2xhc3NOYW1lLnNwbGl0KCcgJykuam9pbignfCcpICsgJyhcXFxcYnwkKScsICdnaScpLCAnICcpO1xuICAgIH1cbiAgfSxcbiAgcmVtb3ZlRWxlbWVudHNCeUNsYXNzIDogZnVuY3Rpb24gKGNsYXNzTmFtZSkge1xuICAgIGVsZW1lbnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShjbGFzc05hbWUpO1xuICAgIHdoaWxlKGVsZW1lbnRzLmxlbmd0aCA+IDApe1xuICAgICAgICBlbGVtZW50c1swXS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsZW1lbnRzWzBdKTtcbiAgICB9XG4gIH0sXG4gIHJlbW92ZUV2ZW50TGlzdGVuZXJzIDogZnVuY3Rpb24gKGVsZW0sZXZlbnRUeXBlLGhhbmRsZXIpIHtcbiAgICBpZiAoZWxlbS5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgICBlbGVtLnJlbW92ZUV2ZW50TGlzdGVuZXIgKGV2ZW50VHlwZSxoYW5kbGVyLGZhbHNlKTtcbiAgICB9XG4gICAgaWYgKGVsZW0uZGV0YWNoRXZlbnQpIHtcbiAgICAgIGVsZW0uZGV0YWNoRXZlbnQgKCdvbicrZXZlbnRUeXBlLGhhbmRsZXIpO1xuICAgIH1cbiAgfSxcbiAgcG9zdEZvcm0gOiBmdW5jdGlvbihvRm9ybUVsZW1lbnQsIGNiKXtcbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCl7IGNiKHhocikgfTtcbiAgICB4aHIub3BlbiAob0Zvcm1FbGVtZW50Lm1ldGhvZCwgb0Zvcm1FbGVtZW50LmFjdGlvbiwgdHJ1ZSk7XG4gICAgeGhyLnNlbmQgKG5ldyBGb3JtRGF0YSAob0Zvcm1FbGVtZW50KSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9LFxuICBzaG93VG9vbHRpcCA6IGZ1bmN0aW9uKGUsIHRvb2x0aXBDbGFzcykge1xuICAgIHZhciBtZXNzYWdlID0gZS50YXJnZXQucGFyZW50Tm9kZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKHRvb2x0aXBDbGFzcylbMF07XG4gICAgaWYobWVzc2FnZS5jbGFzc05hbWUuaW5kZXhPZihcImFjdGl2ZVwiKSA+IC0xKXtcbiAgICAgIG1lc3NhZ2UuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1lc3NhZ2UuY2xhc3NOYW1lICs9ICcgYWN0aXZlJztcbiAgICB9XG4gIH0sXG4gIGxvYWRpbmcgOiBmdW5jdGlvbih0YXJnZXQsIHR5cGUpe1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgdmFyIHNwaW5uZXIgPSB0YXJnZXQucGFyZW50Tm9kZTtcbiAgICBpZihzcGlubmVyLmNsYXNzTmFtZS5pbmRleE9mKFwiYWN0aXZlXCIpID09IC0xKXtcbiAgICAgIHNwaW5uZXIuY2xhc3NOYW1lICs9ICcgYWN0aXZlJztcbiAgICB9XG4gICAgaWYodHlwZSA9PT0gJ3JlbW92ZScpe1xuICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHNwaW5uZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgICB9LCAxMDAwKTtcbiAgICB9XG4gICAgaWYodHlwZSA9PT0gJ3N1Y2Nlc3MnKXtcbiAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBzcGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgICAgICBzcGlubmVyLmNsYXNzTmFtZSArPSAnIGFjdGl2ZSBzdWNjZXNzJztcbiAgICAgIH0sIDEwMDApO1xuICAgIH1cbiAgfSxcbiAgc2V0Q29va2llIDogZnVuY3Rpb24oY25hbWUsY3ZhbHVlLGV4ZGF5cykge1xuICAgIHZhciBkID0gbmV3IERhdGUoKTtcbiAgICBkLnNldFRpbWUoZC5nZXRUaW1lKCkrKGV4ZGF5cyoyNCo2MCo2MCoxMDAwKSk7XG4gICAgdmFyIGV4cGlyZXMgPSBcImV4cGlyZXM9XCIrZC50b0dNVFN0cmluZygpO1xuICAgIGRvY3VtZW50LmNvb2tpZSA9IGNuYW1lICsgXCI9XCIgKyBjdmFsdWUgKyBcIjsgXCIgKyBleHBpcmVzO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaGVscGVycztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9oZWxwZXJzLmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLypcbkNvcHlyaWdodCAoYykgMjAwOCBTdGVmYW4gTGFuZ2UtSGVnZXJtYW5uXG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cbiovXG5cbmZ1bmN0aW9uIG1pY3JvQWpheCh1cmwsIGNhbGxiYWNrRnVuY3Rpb24pXG57XG5cdHRoaXMuYmluZEZ1bmN0aW9uID0gZnVuY3Rpb24gKGNhbGxlciwgb2JqZWN0KSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGNhbGxlci5hcHBseShvYmplY3QsIFtvYmplY3RdKTtcblx0XHR9O1xuXHR9O1xuXG5cdHRoaXMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG5cdFx0aWYgKHRoaXMucmVxdWVzdC5yZWFkeVN0YXRlPT00KVxuXHRcdFx0dGhpcy5jYWxsYmFja0Z1bmN0aW9uKHRoaXMucmVxdWVzdC5yZXNwb25zZVRleHQpO1xuXHR9O1xuXG5cdHRoaXMuZ2V0UmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh3aW5kb3cuQWN0aXZlWE9iamVjdClcblx0XHRcdHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTEhUVFAnKTtcblx0XHRlbHNlIGlmICh3aW5kb3cuWE1MSHR0cFJlcXVlc3QpXG5cdFx0XHRyZXR1cm4gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdHRoaXMucG9zdEJvZHkgPSAoYXJndW1lbnRzWzJdIHx8IFwiXCIpO1xuXG5cdHRoaXMuY2FsbGJhY2tGdW5jdGlvbj1jYWxsYmFja0Z1bmN0aW9uO1xuXHR0aGlzLnVybD11cmw7XG5cdHRoaXMucmVxdWVzdCA9IHRoaXMuZ2V0UmVxdWVzdCgpO1xuXG5cdGlmKHRoaXMucmVxdWVzdCkge1xuXHRcdHZhciByZXEgPSB0aGlzLnJlcXVlc3Q7XG5cdFx0cmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IHRoaXMuYmluZEZ1bmN0aW9uKHRoaXMuc3RhdGVDaGFuZ2UsIHRoaXMpO1xuXG5cdFx0aWYgKHRoaXMucG9zdEJvZHkhPT1cIlwiKSB7XG5cdFx0XHRyZXEub3BlbihcIlBPU1RcIiwgdXJsLCB0cnVlKTtcblx0XHRcdHJlcS5zZXRSZXF1ZXN0SGVhZGVyKCdYLVJlcXVlc3RlZC1XaXRoJywgJ1hNTEh0dHBSZXF1ZXN0Jyk7XG5cdFx0XHRyZXEuc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC10eXBlJywgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpO1xuXHRcdFx0cmVxLnNldFJlcXVlc3RIZWFkZXIoJ0Nvbm5lY3Rpb24nLCAnY2xvc2UnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVxLm9wZW4oXCJHRVRcIiwgdXJsLCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXEuc2VuZCh0aGlzLnBvc3RCb2R5KTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1pY3JvQWpheDtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9taWNyb2FqYXguanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKipcbiAqIHB1YnN1Yi5qc1xuICpcbiAqIEEgdGlueSwgb3B0aW1pemVkLCB0ZXN0ZWQsIHN0YW5kYWxvbmUgYW5kIHJvYnVzdFxuICogcHVic3ViIGltcGxlbWVudGF0aW9uIHN1cHBvcnRpbmcgZGlmZmVyZW50IGphdmFzY3JpcHQgZW52aXJvbm1lbnRzXG4gKlxuICogQGF1dGhvciBGZWRlcmljbyBcIkxveFwiIEx1Y2lnbmFubyA8aHR0cDovL3BsdXMubHkvZmVkZXJpY28ubG94PlxuICpcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2ZlZGVyaWNvLWxveC9wdWJzdWIuanNcbiAqL1xuXG4vKmdsb2JhbCBkZWZpbmUsIG1vZHVsZSovXG4oZnVuY3Rpb24gKGNvbnRleHQpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdC8qKlxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gaW5pdCgpIHtcblx0XHQvL3RoZSBjaGFubmVsIHN1YnNjcmlwdGlvbiBoYXNoXG5cdFx0dmFyIGNoYW5uZWxzID0ge30sXG5cdFx0XHQvL2hlbHAgbWluaWZpY2F0aW9uXG5cdFx0XHRmdW5jVHlwZSA9IEZ1bmN0aW9uO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC8qXG5cdFx0XHQgKiBAcHVibGljXG5cdFx0XHQgKlxuXHRcdFx0ICogUHVibGlzaCBzb21lIGRhdGEgb24gYSBjaGFubmVsXG5cdFx0XHQgKlxuXHRcdFx0ICogQHBhcmFtIFN0cmluZyBjaGFubmVsIFRoZSBjaGFubmVsIHRvIHB1Ymxpc2ggb25cblx0XHRcdCAqIEBwYXJhbSBNaXhlZCBhcmd1bWVudCBUaGUgZGF0YSB0byBwdWJsaXNoLCB0aGUgZnVuY3Rpb24gc3VwcG9ydHNcblx0XHRcdCAqIGFzIG1hbnkgZGF0YSBwYXJhbWV0ZXJzIGFzIG5lZWRlZFxuXHRcdFx0ICpcblx0XHRcdCAqIEBleGFtcGxlIFB1Ymxpc2ggc3R1ZmYgb24gJy9zb21lL2NoYW5uZWwnLlxuXHRcdFx0ICogQW55dGhpbmcgc3Vic2NyaWJlZCB3aWxsIGJlIGNhbGxlZCB3aXRoIGEgZnVuY3Rpb25cblx0XHRcdCAqIHNpZ25hdHVyZSBsaWtlOiBmdW5jdGlvbihhLGIsYyl7IC4uLiB9XG5cdFx0XHQgKlxuXHRcdFx0ICogUHViU3ViLnB1Ymxpc2goXG5cdFx0XHQgKlx0XHRcIi9zb21lL2NoYW5uZWxcIiwgXCJhXCIsIFwiYlwiLFxuXHRcdFx0ICpcdFx0e3RvdGFsOiAxMCwgbWluOiAxLCBtYXg6IDN9XG5cdFx0XHQgKiApO1xuXHRcdFx0ICovXG5cdFx0XHRwdWJsaXNoOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdC8vaGVscCBtaW5pZmljYXRpb25cblx0XHRcdFx0dmFyIGFyZ3MgPSBhcmd1bWVudHMsXG5cdFx0XHRcdFx0Ly8gYXJnc1swXSBpcyB0aGUgY2hhbm5lbFxuXHRcdFx0XHRcdHN1YnMgPSBjaGFubmVsc1thcmdzWzBdXSxcblx0XHRcdFx0XHRsZW4sXG5cdFx0XHRcdFx0cGFyYW1zLFxuXHRcdFx0XHRcdHg7XG5cblx0XHRcdFx0aWYgKHN1YnMpIHtcblx0XHRcdFx0XHRsZW4gPSBzdWJzLmxlbmd0aDtcblx0XHRcdFx0XHRwYXJhbXMgPSAoYXJncy5sZW5ndGggPiAxKSA/XG5cdFx0XHRcdFx0XHRcdEFycmF5LnByb3RvdHlwZS5zcGxpY2UuY2FsbChhcmdzLCAxKSA6IFtdO1xuXG5cdFx0XHRcdFx0Ly9ydW4gdGhlIGNhbGxiYWNrcyBhc3luY2hyb25vdXNseSxcblx0XHRcdFx0XHQvL2RvIG5vdCBibG9jayB0aGUgbWFpbiBleGVjdXRpb24gcHJvY2Vzc1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0XHRcdC8vZXhlY3V0ZXMgY2FsbGJhY2tzIGluIHRoZSBvcmRlclxuXHRcdFx0XHRcdFx0XHQvL2luIHdoaWNoIHRoZXkgd2VyZSByZWdpc3RlcmVkXG5cdFx0XHRcdFx0XHRcdGZvciAoeCA9IDA7IHggPCBsZW47IHggKz0gMSkge1xuXHRcdFx0XHRcdFx0XHRcdHN1YnNbeF0uYXBwbHkoY29udGV4dCwgcGFyYW1zKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdC8vY2xlYXIgcmVmZXJlbmNlcyB0byBhbGxvdyBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHRcdFx0XHRcdFx0c3VicyA9IGNvbnRleHQgPSBwYXJhbXMgPSBudWxsO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdDBcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHQvKlxuXHRcdFx0ICogQHB1YmxpY1xuXHRcdFx0ICpcblx0XHRcdCAqIFJlZ2lzdGVyIGEgY2FsbGJhY2sgb24gYSBjaGFubmVsXG5cdFx0XHQgKlxuXHRcdFx0ICogQHBhcmFtIFN0cmluZyBjaGFubmVsIFRoZSBjaGFubmVsIHRvIHN1YnNjcmliZSB0b1xuXHRcdFx0ICogQHBhcmFtIEZ1bmN0aW9uIGNhbGxiYWNrIFRoZSBldmVudCBoYW5kbGVyLCBhbnkgdGltZSBzb21ldGhpbmcgaXNcblx0XHRcdCAqIHB1Ymxpc2hlZCBvbiBhIHN1YnNjcmliZWQgY2hhbm5lbCwgdGhlIGNhbGxiYWNrIHdpbGwgYmUgY2FsbGVkXG5cdFx0XHQgKiB3aXRoIHRoZSBwdWJsaXNoZWQgYXJyYXkgYXMgb3JkZXJlZCBhcmd1bWVudHNcblx0XHRcdCAqXG5cdFx0XHQgKiBAcmV0dXJuIEFycmF5IEEgaGFuZGxlIHdoaWNoIGNhbiBiZSB1c2VkIHRvIHVuc3Vic2NyaWJlIHRoaXNcblx0XHRcdCAqIHBhcnRpY3VsYXIgc3Vic2NyaXB0aW9uXG5cdFx0XHQgKlxuXHRcdFx0ICogQGV4YW1wbGUgUHViU3ViLnN1YnNjcmliZShcblx0XHRcdCAqXHRcdFx0XHRcIi9zb21lL2NoYW5uZWxcIixcblx0XHRcdCAqXHRcdFx0XHRmdW5jdGlvbihhLCBiLCBjKXsgLi4uIH1cblx0XHRcdCAqXHRcdFx0KTtcblx0XHRcdCAqL1xuXHRcdFx0c3Vic2NyaWJlOiBmdW5jdGlvbiAoY2hhbm5lbCwgY2FsbGJhY2spIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjaGFubmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IFwiaW52YWxpZCBvciBtaXNzaW5nIGNoYW5uZWxcIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghKGNhbGxiYWNrIGluc3RhbmNlb2YgZnVuY1R5cGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIG9yIG1pc3NpbmcgY2FsbGJhY2tcIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY2hhbm5lbHNbY2hhbm5lbF0pIHtcblx0XHRcdFx0XHRjaGFubmVsc1tjaGFubmVsXSA9IFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhbm5lbHNbY2hhbm5lbF0ucHVzaChjYWxsYmFjayk7XG5cblx0XHRcdFx0cmV0dXJuIHtjaGFubmVsOiBjaGFubmVsLCBjYWxsYmFjazogY2FsbGJhY2t9O1xuXHRcdFx0fSxcblxuXHRcdFx0Lypcblx0XHRcdCAqIEBwdWJsaWNcblx0XHRcdCAqXG5cdFx0XHQgKiBEaXNjb25uZWN0IGEgc3Vic2NyaWJlZCBmdW5jdGlvbiBmLlxuXHRcdFx0ICpcblx0XHRcdCAqIEBwYXJhbSBNaXhlZCBoYW5kbGUgVGhlIHJldHVybiB2YWx1ZSBmcm9tIGEgc3Vic2NyaWJlIGNhbGwgb3IgdGhlXG5cdFx0XHQgKiBuYW1lIG9mIGEgY2hhbm5lbCBhcyBhIFN0cmluZ1xuXHRcdFx0ICogQHBhcmFtIEZ1bmN0aW9uIGNhbGxiYWNrIFtPUFRJT05BTF0gVGhlIGV2ZW50IGhhbmRsZXIgb3JpZ2luYWFsbHlcblx0XHRcdCAqIHJlZ2lzdGVyZWQsIG5vdCBuZWVkZWQgaWYgaGFuZGxlIGNvbnRhaW5zIHRoZSByZXR1cm4gdmFsdWVcblx0XHRcdCAqIG9mIHN1YnNjcmliZVxuXHRcdFx0ICpcblx0XHRcdCAqIEBleGFtcGxlXG5cdFx0XHQgKiB2YXIgaGFuZGxlID0gUHViU3ViLnN1YnNjcmliZShcIi9zb21lL2NoYW5uZWxcIiwgZnVuY3Rpb24oKXt9KTtcblx0XHRcdCAqIFB1YlN1Yi51bnN1YnNjcmliZShoYW5kbGUpO1xuXHRcdFx0ICpcblx0XHRcdCAqIG9yXG5cdFx0XHQgKlxuXHRcdFx0ICogUHViU3ViLnVuc3Vic2NyaWJlKFwiL3NvbWUvY2hhbm5lbFwiLCBjYWxsYmFjayk7XG5cdFx0XHQgKi9cblx0XHRcdHVuc3Vic2NyaWJlOiBmdW5jdGlvbiAoaGFuZGxlLCBjYWxsYmFjaykge1xuXHRcdFx0XHRpZiAoaGFuZGxlLmNoYW5uZWwgJiYgaGFuZGxlLmNhbGxiYWNrKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2sgPSBoYW5kbGUuY2FsbGJhY2s7XG5cdFx0XHRcdFx0aGFuZGxlID0gaGFuZGxlLmNoYW5uZWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIGhhbmRsZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aHJvdyBcImludmFsaWQgb3IgbWlzc2luZyBjaGFubmVsXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIShjYWxsYmFjayBpbnN0YW5jZW9mIGZ1bmNUeXBlKSkge1xuXHRcdFx0XHRcdHRocm93IFwiaW52YWxpZCBvciBtaXNzaW5nIGNhbGxiYWNrXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YXIgc3VicyA9IGNoYW5uZWxzW2hhbmRsZV0sXG5cdFx0XHRcdFx0eCxcblx0XHRcdFx0XHR5ID0gKHN1YnMgaW5zdGFuY2VvZiBBcnJheSkgPyBzdWJzLmxlbmd0aCA6IDA7XG5cblx0XHRcdFx0Zm9yICh4ID0gMDsgeCA8IHk7IHggKz0gMSkge1xuXHRcdFx0XHRcdGlmIChzdWJzW3hdID09PSBjYWxsYmFjaykge1xuXHRcdFx0XHRcdFx0c3Vicy5zcGxpY2UoeCwgMSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly9VTURcblx0aWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuXHRcdC8vQU1EIG1vZHVsZVxuXHRcdGRlZmluZSgncHVic3ViJywgaW5pdCk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcblx0XHQvL0NvbW1vbkpTIG1vZHVsZVxuXHRcdG1vZHVsZS5leHBvcnRzID0gaW5pdCgpO1xuXHR9IGVsc2Uge1xuXHRcdC8vdHJhZGl0aW9uYWwgbmFtZXNwYWNlXG5cdFx0Y29udGV4dC5QdWJTdWIgPSBpbml0KCk7XG5cdH1cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3B1YnN1Yi5qc1wiLFwiL1wiKSJdfQ==
