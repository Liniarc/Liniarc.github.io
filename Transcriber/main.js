var SAMPLE_RATE = 44100; //samples per second
var SAMPLE_SIZE = 2; //sample size in bytes

var silentFrames = 2500;
var contentFrames = 20000;
var silenceThreshold = 800;

var file;
var playerPosition = 0;
var maxSplit=30;

$(document).ready(function(){
	setInterval(updateScrubBar, 20);
	var blobQueue = [];
	var rawBuffer = new Int16Array(0);
	
	var playReader = new FileReader();
	playReader.onload = function(e){
	
		newBuffer = new Int16Array(e.target.result);
		temp = new Int16Array(rawBuffer.length + newBuffer.length);
		temp.set(rawBuffer);
		temp.set(newBuffer, rawBuffer.length);
		rawBuffer = temp;
		
		
		playContSound();
		//playSplitSound();
	};	

	var val;
	var byteReader = new FileReader();
	byteReader.onloadend = function(e){
		val = new Int16Array(e.target.result)[0];
	};	

	
	var context = new (window.AudioContext || window.webkitAudioContext)();
	var source = context.createBufferSource();

	var openFile = function (event) {
		var readerPosition=0;
		console.log(event.target);
		file = event.target.files[0];
		while (SAMPLE_RATE*SAMPLE_SIZE*(readerPosition+maxSplit) < file.size)
		{	
			blobQueue.push(file.slice(SAMPLE_RATE*SAMPLE_SIZE*readerPosition,SAMPLE_RATE*SAMPLE_SIZE*(readerPosition+maxSplit)));
		}
		blobQueue.push(file.slice(SAMPLE_RATE*readerPosition));
		readNext();
	};
	
	function readNext()
	{
		console.log(blobQueue.length);
		console.log(rawBuffer.length);
		
		if (blobQueue.length > 0 || rawBuffer.length != 0)
		{
			if (rawBuffer.length < maxSplit*SAMPLE_RATE && blobQueue.length > 0)
				playReader.readAsArrayBuffer(blobQueue.shift());
			else
			{
				playSplitSound()
			}
		}
	}

	function playContSound(){
		var audioBuffer = context.createBuffer(1,rawBuffer.length,SAMPLE_RATE);
		var channelBuffer = audioBuffer.getChannelData(0);
		for (var i = 0; i < rawBuffer.length; i++) {
			channelBuffer[i] = rawBuffer[i]/32768;
		}
		rawBuffer = new Int16Array(0);
		var source = context.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(context.destination);
		source.start();
		source.bind('ended', function() {
			console.log("Ended");
			readNext();
		});
	};
	
	function playSplitSound(){
		var splitEnd = 0;
		var silence = 0;
		var content = 0;
		while (splitEnd < rawBuffer.length)
		{
			if (Math.abs(rawBuffer[splitEnd]) < silenceThreshold)
			{
				if (content > contentFrames)
					silence++;
				if (silence > silentFrames)
				{
					splitEnd++;
					break;
				}
			}
			else
			{
				content++;
				silence = 0;
			}
			splitEnd++;
		}
		var audioBuffer = context.createBuffer(1,splitEnd,SAMPLE_RATE);
		var channelBuffer = audioBuffer.getChannelData(0);
		for (var i = 0; i < splitEnd; i++) {
			channelBuffer[i] = rawBuffer[i]/32768;
		}
		
		rawBuffer = rawBuffer.slice(splitEnd);
		playerPosition += splitEnd*2;
		
		var source = context.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(context.destination);
		source.start();
		
		//on ended doesn't work consistently, manually stop based on sample length
		setTimeout(	function() {
			source.stop();	
			console.log("Ended");
			setTimeout(function() {readNext()}, 1 * 1000);
		}, splitEnd*1000/SAMPLE_RATE); 
		
		//source.onended = function() {
		//	console.log("Ended");
		//	setTimeout(function() {readNext()}, 1 * 1000);
		//};
	};
	
	function updateScrubBar(){
		if (file == null || file.size<=0)
			$("#scrubBar").val(0);
		else
		{
			$("#scrubBar").val(playerPosition/file.size*100);
		}
	};

	$("#file").on("change", openFile);
//	$("#play").on("click", play);
//	$("#pause").on("click", pause);
//	$("#stop").on("click", stop);
	$("#next").on("click", readNext);
});