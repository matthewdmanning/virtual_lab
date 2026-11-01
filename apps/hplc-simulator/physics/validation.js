/** Use this function to reject non-numeric values at a physics boundary. */
export function requireFinite(name, value) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number.`);
}

/** Use this function when a physical input must be strictly above zero. */
export function requirePositive(name, value) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
    if (value <= 0) throw new RangeError(`${name} must be positive.`);
}

/** Use this function to catch arithmetic overflow before it reaches a caller. */
export function requireFiniteOutput(name, value) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} is outside the numeric range.`);
}
