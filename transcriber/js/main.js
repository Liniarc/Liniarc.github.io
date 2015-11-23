var sample_rate = 44100; //samples per second
var sample_size = 2; //sample size in bytes
var channels = 1; // num channels

var file;
var bufferStartPosition = 0;
var playerPosition = 0;
var audioStartPosition = 0;
var maxSplit=sample_rate*sample_size*channels*30;

$(document).ready(function(){
	
	var context = new (window.AudioContext || window.webkitAudioContext)();
	var source = context.createBufferSource();
	var timeout;
	
	//ui
	var scrubBar = $("#scrubBar");
	var timestamp = $("#timestamp");
	var fileSelector = $("#file");
	var playButton = $("#play");
	var pauseButton = $("#pause");
	var stopButton = $("#stop");
	var prevButton = $("#prev");
	var replayButton = $("#replay");
	var nextButton = $("#next");
	
	var prev30sButton = $("#prev30s");
	var prev5sButton = $("#prev5s");
	var skip5sButton = $("#skip5s");
	var skip30sButton = $("#skip30s");
	
	var textArea = $('#textArea');
	
	var replayPosition = -1;
	
	setInterval(update, 20);
	
	var blobQueue = [];
	var rawBuffer = new Int16Array(0);
	var playReader = new FileReader();
	playReader.onload = function(e){

		newBuffer = new Int16Array(e.target.result);
		temp = rawBuffer;
		rawBuffer = new Int16Array(rawBuffer.length + newBuffer.length);
		rawBuffer.set(temp);
		rawBuffer.set(newBuffer, temp.length);
	};	
	
	var playbackDataReader = new FileReader();
	playbackDataReader.onload = function(e){
		dataBuffer = new Int16Array(e.target.result);
		
		sample_rate = (dataBuffer[12]<0?dataBuffer[12]+65536:dataBuffer[12])+(dataBuffer[13]<0?dataBuffer[13]+65536:dataBuffer[13])*65536;
		channels = dataBuffer[11];
		sample_size = dataBuffer[17]/8;
		
		scrubBar.slider( "option", 'max', file.size/sample_size/channels);
		maxSplit=sample_rate*sample_size*channels*30;
	}
	
	var openFile = function (event) {
		bufferStartPosition = 0;
		file = event.target.files[0];
		scrubBar.slider( "option", "value", 0 );
		updateTimestamp(0);
		
		if (file != null && file.size > 0)
		{
			getPlaybackData();
			load();
			buffer();
		}
	};
	
	//Settings
	var silenceSplits = true; //split based on silence instead of time.
	var silentFrames = 2500; // how long a silence must be between splits
	var contentFrames = 20000; // minimum number of frames of content per split
	var silenceThreshold = 800; // absolute value of PCM for which it's considered silent 
	var splitLen = 5000; //split lengths in ms.
	
	var fastTalking = false;
	
	var playingCont = false;
	var playingSplit = false;
	var isSeeking = false;
	
	function play()
	{
		replayPosition = -1;
		if (playingCont || playingSplit)
		{
			console.warn("Play pressed while already playing");
			return;
		}
		else
		{
			playContSound();
		}
	};
	
	function pause()
	{
		haltAudio();
		bufferStartPosition = playerPosition;
		load(playerPosition);
		buffer();
	};
	
	function playPause()
	{
		if (playingCont || playingSplit)
			pause();
		else
			play();
		
	}
	
	function stop()
	{
		haltAudio();
		
		replayPosition = -1;
		playerPosition = 0;
		bufferStartPosition = 0;
		scrubBar.slider( "option", "value", playerPosition);
		updateTimestamp(playerPosition);
		load(playerPosition);
		buffer();
	};
	
	function previous()
	{
		
	};
	
	function replay()
	{
		if (!playingCont)
		{
			haltAudio();
			if (replayPosition < 0)
			{
				next();
			}
			else
			{
				seek(replayPosition);
				setTimeout( function(){
					next();
				}, 100);
			}
		}
	};
	
	function next()	
	{	
		replayPosition = playerPosition;
		if (playingSplit)
		{
			haltAudio();

			playerPosition = bufferStartPosition;
			setTimeout( function(){
				playingSplit = true;
				playSplitSound();
			}, 100);
			
			console.warn("Next pressed while already playing");
			return;
		}
		else if (!playingCont)
		{
			playSplitSound();
		}
	};
	
	function seek(position)
	{
		seeking(); 
		replayPosition = -1;
		playerPosition = parseInt(position);
		if (playerPosition < 0)
			playerPosition = 0;
		if (playerPosition >= file.size/sample_size/channels)
			playerPosition = file.size/sample_size/channels-1;
		bufferStartPosition = playerPosition;
		scrubBar.slider( "option", "value", playerPosition);
		updateTimestamp(playerPosition);
		load(playerPosition);
		buffer();
		console.log(playerPosition);
		
		isSeeking = false;
		if (playingCont)
		{
			audioStartPosition = context.currentTime - (bufferStartPosition/sample_rate);
			setTimeout( function(){
				playContSound();
			}, 100);
		}
		else if (playingSplit)
		{
			audioStartPosition = context.currentTime - (bufferStartPosition/sample_rate);
			setTimeout( function(){
				playSplitSound();
			}, 100);
		}
	};
	
	function seeking()
	{
		isSeeking = true;
		if (playingCont || playingSplit)
		{
			if (timeout != null)
				clearTimeout(timeout);
			source.stop();
		}
	}
	
	function load(position)
	{
		var readerPosition = typeof position !== 'undefined' ? position*sample_size*channels : 0;
		blobQueue = [];
		rawBuffer = new Int16Array(0);
		console.log("Pushed at" + readerPosition);
		while ((readerPosition+maxSplit) < file.size)
		{
			blobQueue.push(file.slice(readerPosition,(readerPosition+maxSplit)));
			
			readerPosition+=maxSplit;
		}
		blobQueue.push(file.slice(readerPosition));		
	}
	
	function getPlaybackData()
	{
		playbackDataReader.readAsArrayBuffer(file.slice(0,36));
	}
		
	function buffer()
	{
		if (blobQueue.length > 0)
		{
			if (rawBuffer.length < maxSplit*sample_rate && blobQueue.length > 0) //Do we need to buffer more?
				playReader.readAsArrayBuffer(blobQueue.shift());
		}
	}
	
	function haltAudio()
	{
		if (playingCont || playingSplit)
		{
			if (timeout != null)
				clearTimeout(timeout);
			playingCont = false;
			playingSplit = false;
			source.stop();
		}
	}

	function playContSound(){
		if (rawBuffer.length == 0) //Done with file
		{
			stop();
			return;
		}
		playingCont = true;
		var audioBuffer = context.createBuffer(1,rawBuffer.length/channels,sample_rate);
		var channelBuffer = audioBuffer.getChannelData(0);
		var splitEnd = rawBuffer.length;
		for (var i = 0; i < splitEnd; i++) {
			channelBuffer[i] = rawBuffer[i*channels]/32768;
		}
		rawBuffer = new Int16Array(0);
		buffer();
		
		playAudioBuffer(audioBuffer, playContSound);
	};
	
	function playSplitSound(){
		if (rawBuffer.length == 0)
			return;
		playingSplit = true;
		var splitEnd = 0;
		var silence = 0;
		var content = 0;
		while (splitEnd*channels < rawBuffer.length && silence < silentFrames)
		{
			if (Math.abs(rawBuffer[splitEnd*channels]) < silenceThreshold)
			{
				if (content > contentFrames)
					silence++;
			}
			else
			{
				content++;
				silence = 0;
			}
			splitEnd+=channels;
		}
		var audioBuffer = context.createBuffer(1,splitEnd,sample_rate);
		var channelBuffer = audioBuffer.getChannelData(0);
		for (var i = 0; i < splitEnd; i++) {
			channelBuffer[i] = rawBuffer[i*channels]/32768;
		}
		
		rawBuffer = rawBuffer.slice(splitEnd*channels);
		buffer();
		
		bufferStartPosition += splitEnd;
		
		playAudioBuffer(audioBuffer);
	};
	
	function playAudioBuffer(audioBuffer, onFinishedFunction)
	{
		source = context.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(context.destination);
		source.start();
		
		if (timeout != null)
			clearTimeout(timeout);
		//on ended doesn't work consistently, manually stop based on sample length
		timeout = setTimeout(function() {
			haltAudio();
			if (typeof onFinishedFunction !== 'undefined')
				onFinishedFunction();
		}, audioBuffer.length*1000/sample_rate); 
	}
		
	
	function update(){
		if (file == null || file.size<=0)
		{
			playButton.show();
			pauseButton.hide();
			
			$('#player button').button( "disable" );
			scrubBar.slider( "disable" );
			timestamp.prop('disabled',true);
			
			scrubBar.slider( "option", "value", 0 );
			updateTimestamp(0);
		}
		else
		{
			
			$('#player button').button( "enable" );
			scrubBar.slider( "enable" );
			timestamp.prop('disabled',false);
			
			if (playingCont || playingSplit)
			{
				playButton.hide();
				pauseButton.show();
				
				if (!isSeeking)
				{
					playerPosition = Math.round((context.currentTime - audioStartPosition)*sample_rate);
					scrubBar.slider( "option", "value", playerPosition );
					updateTimestamp(playerPosition);
				}
			}
			else
			{
				playButton.show();
				pauseButton.hide();
				audioStartPosition = context.currentTime - (bufferStartPosition/sample_rate);
			}
		}
	};
	
	function updateTimestamp(position)
	{
		var ms = ('000' + Math.floor((position/sample_rate*1000)%1000)).slice(-3);
		var secs = ('00'+Math.floor((position/sample_rate)%60)).slice(-2);
		var mins = ('00'+Math.floor((position/sample_rate/60)%60)).slice(-2);
		var hours = Math.floor((position/sample_rate/3600));

		timestamp.val(hours + ":" + mins + ":" + secs + "." + ms);
	}
	
	fileSelector.on("click", haltAudio);
	fileSelector.on("change", openFile);
	playButton.on("click", play);
	pauseButton.on("click", pause);
	stopButton.on("click", stop);
	replayButton.on("click", replay);
	nextButton.on("click", next);
	
	prev5sButton.on("click", function(){seek(playerPosition-5*sample_rate)});
	prev30sButton.on("click", function(){seek(playerPosition-30*sample_rate)});
	skip5sButton.on("click", function(){seek(playerPosition+5*sample_rate)});
	skip30sButton.on("click", function(){seek(playerPosition+30*sample_rate)});

	textArea.on('keydown', null, 'ctrl+j', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		replay();
	});
	textArea.on('keydown', null, 'ctrl+k', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		next();
	});
	textArea.on('keydown', null, 'ctrl+u', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		seek(playerPosition-5*sample_rate)
	});
	textArea.on('keydown', null, 'ctrl+i', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		seek(playerPosition+5*sample_rate);
	});
	textArea.on('keydown', null, 'ctrl+o', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		seek(playerPosition+30*sample_rate);
	});
	textArea.on('keydown', null, 'ctrl+y', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		seek(playerPosition-30*sample_rate);
	});
	textArea.on('keydown', null, 'ctrl+p', function(evt){
		evt.stopPropagation();
		evt.preventDefault();
		playPause();
	});
	
	//scrubBar.on("mousedown",seeking);
	//scrubBar.on("change",function(){seek(scrubBar.slider( "option", "value", ))});
	
	scrubBar.slider({
		range: "min",
		start: seeking,
		slide: function(){updateTimestamp(scrubBar.slider( "option", "value" ))},
		stop: function(){seek(scrubBar.slider( "option", "value" ))}
	});
	
	playButton.button({
		icons: { primary: "ui-icon-play" },
		text: false
	});
	pauseButton.button({
		icons: { primary: "ui-icon-pause" },
		text: false
	});
	stopButton.button({
		icons: { primary: "ui-icon-stop" },
		text: false
	});
	replayButton.button({
		icons: { primary: "ui-icon-arrowreturnthick-1-w" },
		text: false
	});
	nextButton.button({
		icons: { primary: "ui-icon-arrowthickstop-1-e" },
		text: false
	});
	
	prev30sButton.button({
		icons: { primary: "ui-icon-seek-prev" },
		text: false
	});
	prev5sButton.button({
		icons: { primary: "ui-icon-triangle-1-w" },
		text: false
	});
	skip5sButton.button({
		icons: { primary: "ui-icon-triangle-1-e" },
		text: false
	});
	skip30sButton.button({
		icons: { primary: "ui-icon-seek-next" },
		text: false
	});

});