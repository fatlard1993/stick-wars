// Every test run is a test, whatever this shell's NODE_ENV says: the hall of gladiators and the armory then live only in
// memory, and no test ever writes over the ones players have filled
process.env.NODE_ENV = 'test';
