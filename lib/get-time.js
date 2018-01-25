'use strict';

const rpad = (s, char, count) => (s + char.repeat(count - s.length));

let name;

const getTimeSync = (func, count) => {
  const result = [];
  let i, time = 0;
  for (i = 0; i < count; i++) {
    const begin = process.hrtime();
    result.push(func());
    const end = process.hrtime(begin);
    time += end[0] * 1e9 + end[1];
  }
  process.send({ name, time });
};

const getTimeAsync = (func, count) => {
  const result = [];
  let i, time = 0;
  const partFunc = (begin, ...args) => {
    func(...args, () => {
      const end = process.hrtime(begin);
      time += end[0] * 1e9 + end[1];
      result.push(end);
      if (result.length === count) process.send({ name, time });
    });
  };
  for (i = 0; i < count; i++) {
    partFunc(process.hrtime());
  }
};

process.on('message', (msg) => {
  const func = eval(msg.funcBoby);
  name = rpad(msg.funcName, '.', 25);
  if (msg.typeOfReq === 'sync') getTimeSync(func, msg.iterations);
  else getTimeAsync(func, msg.iterations);
});
