import { FileVideo, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { ChangeEvent, FormEvent, useState, useMemo, useRef } from 'react';
import { getFFmpeg } from '@/lib/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { api } from '@/lib/axios';

type Status = 'waiting' | 'converting' | 'uploading' | 'generating' | 'success';

const statusMessages = {
  converting: 'Convertendo...',
  uploading: 'Carregando vídeo...',
  generating: 'Transcrevendo...',
  success: 'Sucesso!',
}

interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void
}

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File|null>(null);
  const [status, setStatus] = useState<Status>('waiting')

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const previewURL = useMemo(() => {
    if (!videoFile) {
      return null;
    }

    return URL.createObjectURL(videoFile);
  }, [videoFile]);

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;

    if (!files) {
      return;
    }

    const selectedFile = files[0];
    setVideoFile(selectedFile);
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = promptInputRef.current?.value;

    if (!videoFile) {
      return;
    }

    setStatus('converting');

    const audioFile = await convertVideoToAudio(videoFile);

    const data = new FormData();
    data.append('file', audioFile);

    setStatus('uploading');

    const response = await api.post('/videos', data);
    const videoId = response.data.video.id;

    setStatus('generating');

    await api.post(`/videos/${videoId}/transcription`, {
      prompt,
    });

    setStatus('success');

    props.onVideoUploaded(videoId);
  }

  async function convertVideoToAudio(video: File) {
    console.log('Convert Started');

    const ffmpeg = await getFFmpeg();
    await ffmpeg.writeFile('input.mp4', await fetchFile(video));

    ffmpeg.on('progress', progress => {
      console.log('Convert progress: ' + Math.round(progress.progress * 100) + '%')
    })

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20k',
      '-acodec',
      'libmp3lame',
      'output.mp3',
    ]);

    const data = await ffmpeg.readFile('output.mp3');

    const audioFileBlob = new Blob([data], { type: 'audio/mpeg' });
    const audioFile = new File([audioFileBlob], 'audio.mp3', {
      type: 'audio/mpeg',
    });

    console.log('Convert Completed');

    return audioFile;
  }

  return (
    <form className='space-y-5' onSubmit={handleUploadVideo}>
      <label
        className='relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-neutral-50'
        htmlFor='video'
      >
        {
          previewURL ? (
            <video
              className='pointer-events-none absolute inset-0'
              src={previewURL}
              controls={false}
            />
          ) : (
            <>
              <FileVideo className='w-4 h-4' />
              Selecione um vídeo
            </>
          )
        }
      </label>

      <input type='file' id='video' accept='video/mp4' className='sr-only' onChange={handleFileSelected}/>

      <Separator />

      <div className='space-y-2'>
        <Label htmlFor='transcription_prompt'>Prompt de transcrição</Label>
        <Textarea
          id='transcription_prompt'
          ref={promptInputRef}
          disabled={status !== 'waiting'}
          className='h-20 leading-relaxed resize-none'
          placeholder='Inclua palavras-chave mencionadas no vídeo separadas por vírgula'
        />

        <Button
          data-success={status === 'success'}
          disabled={status !== 'waiting'}
          type='submit'
          className='w-full data-[success=true]:bg-emerald-700'
        >
          {
            status === 'waiting' ? (
              <>
                Carregar vídeo
                <Upload className='w-4 h-4 ml-2' />
              </>
            ) : statusMessages[status]
          }
          
        </Button>
      </div>
    </form>
  )
}