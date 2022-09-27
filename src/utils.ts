function stringify(strings: string[], args: any) {
  let string = "";
  for (let i = 1; i < strings.length; i++) {
    string += strings[i];
    console.log(string)
    string += args[i];
    console.log(string)
  }
  return string;
}
