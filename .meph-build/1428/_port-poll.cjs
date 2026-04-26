var net=require('net'),n=0;
(function t(){
  var s=net.createConnection(8283,'127.0.0.1');
  s.on('connect',function(){s.destroy();process.exit(0);});
  s.on('error',function(){if(++n<25)setTimeout(t,200);else process.exit(1);});
})();